import { Logger } from "@nestjs/common";
import type { DomainEvent } from "./domain-events.service";
import type { DomainEventConsumerAdapter, DomainEventConsumerLane } from "./domain-event-consumers.service";
import type { RedisDomainEventBusPayload } from "./redis-domain-event-bus.service";

export type RedisConsumerClient = {
  xgroup(...args: unknown[]): Promise<unknown>;
  xreadgroup(...args: unknown[]): Promise<Array<[string, Array<[string, string[]]>]> | null>;
  xautoclaim?(...args: unknown[]): Promise<unknown>;
  xack(...args: unknown[]): Promise<unknown>;
  xadd(...args: unknown[]): Promise<unknown>;
  disconnect(): void;
};

type RedisDomainEventConsumerOptions = {
  blockMs?: number;
  consumerName?: string;
  deadLetterStream?: string;
  pendingIdleMs?: number;
  stream?: string;
};

const defaultStream = "guestos:domain-events";
const defaultDeadLetterStream = "guestos:domain-events:dead-letter";

export class RedisDomainEventConsumerAdapter implements DomainEventConsumerAdapter {
  private readonly logger = new Logger(RedisDomainEventConsumerAdapter.name);
  private readonly blockMs: number;
  private readonly consumerName: string;
  private readonly deadLetterStream: string;
  private readonly pendingIdleMs: number;
  private readonly stream: string;

  constructor(
    private readonly client: RedisConsumerClient,
    options: RedisDomainEventConsumerOptions = {}
  ) {
    this.blockMs = options.blockMs ?? 5000;
    this.consumerName = options.consumerName ?? `consumer_${process.pid}`;
    this.deadLetterStream = options.deadLetterStream ?? defaultDeadLetterStream;
    this.pendingIdleMs = options.pendingIdleMs ?? 30000;
    this.stream = options.stream ?? defaultStream;
  }

  async start(lane: DomainEventConsumerLane, onMessage: (messageId: string, event: DomainEvent) => Promise<void>) {
    const group = this.groupName(lane);
    let closed = false;

    await this.ensureGroup(group);

    const readLoop = async () => {
      while (!closed) {
        let processedCount = await this.claimPendingMessages(group, onMessage, () => closed);
        if (closed) {
          break;
        }

        const result = await this.client.xreadgroup(
          "GROUP",
          group,
          this.consumerName,
          "BLOCK",
          this.blockMs,
          "COUNT",
          10,
          "STREAMS",
          this.stream,
          ">"
        );
        const entries = result?.[0]?.[1] ?? [];

        for (const [messageId, fields] of entries) {
          if (closed) {
            break;
          }

          const event = this.eventFromFields(fields);
          if (event) {
            await onMessage(messageId, event);
            processedCount += 1;
            if (closed) {
              break;
            }
          }
        }

        if (!processedCount && !entries.length) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }
    };

    void readLoop().catch((error) => {
      if (!closed) {
        this.logger.warn(`Redis consumer ${lane} stopped: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });

    return () => {
      closed = true;
    };
  }

  async acknowledge(lane: DomainEventConsumerLane, messageId: string) {
    await this.client.xack(this.stream, this.groupName(lane), messageId);
  }

  async deadLetter(lane: DomainEventConsumerLane, messageId: string, event: DomainEvent, error: string) {
    await this.client.xadd(
      this.deadLetterStream,
      "MAXLEN",
      "~",
      "10000",
      "*",
      "lane",
      lane,
      "messageId",
      messageId,
      "error",
      error,
      "event",
      JSON.stringify(event)
    );
  }

  private async ensureGroup(group: string) {
    try {
      await this.client.xgroup("CREATE", this.stream, group, "$", "MKSTREAM");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("BUSYGROUP")) {
        throw error;
      }
    }
  }

  private eventFromFields(fields: string[]) {
    const payloadIndex = fields.findIndex((field) => field === "payload");
    const rawPayload = payloadIndex >= 0 ? fields[payloadIndex + 1] : null;

    if (!rawPayload) {
      return null;
    }

    return (JSON.parse(rawPayload) as RedisDomainEventBusPayload).event;
  }

  private async claimPendingMessages(
    group: string,
    onMessage: (messageId: string, event: DomainEvent) => Promise<void>,
    isClosed: () => boolean
  ) {
    if (!this.client.xautoclaim) {
      return 0;
    }

    const result = await this.client.xautoclaim(
      this.stream,
      group,
      this.consumerName,
      this.pendingIdleMs,
      "0-0",
      "COUNT",
      10
    );
    const entries = this.pendingEntriesFromResult(result);
    let processedCount = 0;

    for (const [messageId, fields] of entries) {
      if (isClosed()) {
        break;
      }

      const event = this.eventFromFields(fields);
      if (event) {
        await onMessage(messageId, event);
        processedCount += 1;
      }
    }

    return processedCount;
  }

  private pendingEntriesFromResult(result: unknown): Array<[string, string[]]> {
    if (!Array.isArray(result)) {
      return [];
    }

    const entries = result[1];
    return Array.isArray(entries) ? (entries as Array<[string, string[]]>) : [];
  }

  private groupName(lane: DomainEventConsumerLane) {
    return `guestos:${lane}`;
  }
}

export function createRedisDomainEventConsumerAdapter(url: string | undefined): DomainEventConsumerAdapter | null {
  if (!url) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const Redis = require("ioredis");
  return new RedisDomainEventConsumerAdapter(new Redis(url));
}
