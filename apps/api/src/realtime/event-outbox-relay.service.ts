import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { DomainEvent } from "./domain-events.service";
import { PrismaService } from "../database/prisma.service";
import { RedisDomainEventBusService } from "./redis-domain-event-bus.service";

const OUTBOX_POLL_INTERVAL_MS = 5_000;
const OUTBOX_BATCH_SIZE = 50;

@Injectable()
export class EventOutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventOutboxRelayService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisBus: RedisDomainEventBusService
  ) {}

  onModuleInit() {
    this.startPoller();
  }

  onModuleDestroy() {
    this.stopPoller();
  }

  private startPoller() {
    this.pollTimer = setInterval(() => {
      this.processPendingOutboxEvents().catch((err) => {
        this.logger.error("Failed to process pending outbox events", err);
      });
    }, OUTBOX_POLL_INTERVAL_MS);
  }

  private stopPoller() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async processPendingOutboxEvents(): Promise<void> {
    const pending = await this.prisma.eventOutbox.findMany({
      where: { status: "pending" },
      take: OUTBOX_BATCH_SIZE,
      orderBy: { createdAt: "asc" }
    });

    if (pending.length === 0) {
      return;
    }

    this.logger.debug(`Processing ${pending.length} pending outbox events`);

    for (const record of pending) {
      try {
        const event = record.payload as unknown as DomainEvent;
        await this.redisBus.publish(event);

        await this.prisma.eventOutbox.update({
          where: { id: record.id },
          data: {
            status: "published",
            processedAt: new Date(),
            attempts: { increment: 1 }
          }
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";

        this.logger.warn(`Failed to publish outbox event ${record.id} (attempt ${record.attempts + 1}): ${errorMessage}`);

        await this.prisma.eventOutbox.update({
          where: { id: record.id },
          data: {
            attempts: { increment: 1 },
            lastError: errorMessage
          }
        });
      }
    }
  }
}
