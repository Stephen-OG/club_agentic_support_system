import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import type { DomainEvent } from "./domain-events.service";

export const REDIS_DOMAIN_EVENT_BUS_ADAPTER = Symbol("REDIS_DOMAIN_EVENT_BUS_ADAPTER");
export const REDIS_DOMAIN_EVENT_BUS_INSTANCE_ID = Symbol("REDIS_DOMAIN_EVENT_BUS_INSTANCE_ID");

export type RedisDomainEventBusPayload = {
  originId: string;
  event: DomainEvent;
};

export type RedisDomainEventBusAdapter = {
  append(stream: string, payload: RedisDomainEventBusPayload): Promise<void>;
  subscribe(stream: string, onPayload: (payload: RedisDomainEventBusPayload) => void): Promise<(() => void) | void>;
};

const domainEventsStream = "madupe:domain-events";

@Injectable()
export class RedisDomainEventBusService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisDomainEventBusService.name);
  private readonly unsubscribeCallbacks: Array<() => void> = [];
  private readonly adapter: RedisDomainEventBusAdapter | null;
  private readonly instanceId: string;

  constructor(
    @Optional() @Inject(REDIS_DOMAIN_EVENT_BUS_ADAPTER) adapter?: RedisDomainEventBusAdapter | null,
    @Optional() @Inject(REDIS_DOMAIN_EVENT_BUS_INSTANCE_ID) instanceId?: string
  ) {
    this.adapter = adapter ?? createRedisStreamsAdapter(process.env.REDIS_URL, this.logger);
    this.instanceId = instanceId ?? randomUUID();
  }

  async publish(event: DomainEvent) {
    await this.adapter?.append(domainEventsStream, {
      event,
      originId: this.instanceId
    });
  }

  async subscribe(onEvent: (event: DomainEvent) => void) {
    const unsubscribe = await this.adapter?.subscribe(domainEventsStream, (payload) => {
      if (payload.originId === this.instanceId) {
        return;
      }

      onEvent(payload.event);
    });

    if (unsubscribe) {
      this.unsubscribeCallbacks.push(unsubscribe);
    }
  }

  onModuleDestroy() {
    for (const unsubscribe of this.unsubscribeCallbacks.splice(0)) {
      unsubscribe();
    }
  }
}

export function shouldUseRedisDomainEvents(env: NodeJS.ProcessEnv = process.env) {
  if (env.DISABLE_REDIS_EVENTS === "true") {
    return false;
  }

  if (env.NODE_ENV === "production") {
    return true;
  }

  return env.ENABLE_REDIS_EVENTS === "true";
}

function createRedisStreamsAdapter(url: string | undefined, logger: Logger): RedisDomainEventBusAdapter | null {
  if (!url || !shouldUseRedisDomainEvents()) {
    logger.log("REDIS_URL not set, realtime events use in-process fanout only");
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const Redis = require("ioredis");
    const writer = new Redis(url, { maxRetriesPerRequest: 2 });
    const reader = new Redis(url, { maxRetriesPerRequest: 2 });
    writer.on("error", (error: Error) => {
      logger.warn(`Redis Streams writer error: ${error.message}`);
    });
    reader.on("error", (error: Error) => {
      logger.warn(`Redis Streams reader error: ${error.message}`);
    });

    return {
      async append(stream, payload) {
        await writer.xadd(stream, "MAXLEN", "~", "10000", "*", "payload", JSON.stringify(payload));
      },
      async subscribe(stream, onPayload) {
        let closed = false;
        let lastId = "$";

        async function readLoop() {
          while (!closed) {
            try {
              const result = await reader.xread("BLOCK", 5000, "STREAMS", stream, lastId);
              const entries = result?.[0]?.[1] ?? [];

              for (const [id, fields] of entries) {
                lastId = id;
                const payloadIndex = fields.findIndex((field: string) => field === "payload");
                const rawPayload = payloadIndex >= 0 ? fields[payloadIndex + 1] : null;

                if (rawPayload) {
                  onPayload(JSON.parse(rawPayload) as RedisDomainEventBusPayload);
                }
              }
            } catch (error) {
              if (!closed) {
                logger.warn(`Redis Streams realtime read failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }
        }

        void readLoop();

        return () => {
          closed = true;
          reader.quit().catch(() => {});
          writer.quit().catch(() => {});
        };
      }
    };
  } catch (error) {
    logger.warn(`Failed to create Redis Streams event bus: ${error instanceof Error ? error.message : "Unknown error"}`);
    return null;
  }
}
