import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import type { DomainEvent } from "./domain-events.service";

export const DOMAIN_EVENT_CONSUMER_ADAPTER = Symbol("DOMAIN_EVENT_CONSUMER_ADAPTER");

export type DomainEventConsumerLane = "notifications" | "analytics" | "audit" | "webhooks";

export type DomainEventConsumerHandler = (event: DomainEvent) => Promise<void>;

export type DomainEventConsumerAdapter = {
  start?(
    lane: DomainEventConsumerLane,
    onMessage: (messageId: string, event: DomainEvent) => Promise<void>
  ): Promise<(() => void) | void>;
  acknowledge(lane: DomainEventConsumerLane, messageId: string): Promise<void>;
  deadLetter(lane: DomainEventConsumerLane, messageId: string, event: DomainEvent, error: string): Promise<void>;
};

type DomainEventConsumerOptions = {
  maxAttempts?: number;
};

@Injectable()
export class DomainEventConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(DomainEventConsumerService.name);
  private readonly handlers = new Map<DomainEventConsumerLane, DomainEventConsumerHandler>();
  private readonly startedLanes = new Set<DomainEventConsumerLane>();
  private readonly stopCallbacks: Array<() => void> = [];
  private readonly attempts = new Map<string, number>();
  private readonly maxAttempts: number;

  constructor(
    @Optional() @Inject(DOMAIN_EVENT_CONSUMER_ADAPTER) private readonly adapter?: DomainEventConsumerAdapter,
    options: DomainEventConsumerOptions = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  registerLane(lane: DomainEventConsumerLane, handler: DomainEventConsumerHandler) {
    this.handlers.set(lane, handler);
    void this.startLane(lane);
  }

  async processMessage(lane: DomainEventConsumerLane, messageId: string, event: DomainEvent) {
    const handler = this.handlers.get(lane);

    if (!handler) {
      await this.adapter?.acknowledge(lane, messageId);
      return;
    }

    try {
      await handler(event);
      this.attempts.delete(this.attemptKey(lane, messageId));
      await this.adapter?.acknowledge(lane, messageId);
    } catch (error) {
      const attemptKey = this.attemptKey(lane, messageId);
      const attemptCount = (this.attempts.get(attemptKey) ?? 0) + 1;
      this.attempts.set(attemptKey, attemptCount);

      if (attemptCount < this.maxAttempts) {
        this.logger.warn(`Domain event consumer ${lane} failed attempt ${attemptCount}: ${this.errorMessage(error)}`);
        return;
      }

      this.attempts.delete(attemptKey);
      await this.adapter?.deadLetter(lane, messageId, event, this.errorMessage(error));
      await this.adapter?.acknowledge(lane, messageId);
    }
  }

  private attemptKey(lane: DomainEventConsumerLane, messageId: string) {
    return `${lane}:${messageId}`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown consumer error";
  }

  private async startLane(lane: DomainEventConsumerLane) {
    if (this.startedLanes.has(lane)) {
      return;
    }

    this.startedLanes.add(lane);
    const stop = await this.adapter?.start?.(lane, (messageId, event) => this.processMessage(lane, messageId, event));

    if (stop) {
      this.stopCallbacks.push(stop);
    }
  }

  onModuleDestroy() {
    for (const stop of this.stopCallbacks.splice(0)) {
      stop();
    }
  }
}
