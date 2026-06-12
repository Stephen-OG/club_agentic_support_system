import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StructuredLogger } from "../common/logger/structured-logger.service";
import { PrismaService } from "../database/prisma.service";
import type { DomainEvent } from "../realtime/domain-events.service";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class AuditEventsConsumer implements OnModuleInit {
  private registered = false;

  constructor(
    private readonly consumers: DomainEventConsumerService,
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLogger
  ) {}

  onModuleInit() {
    if (this.registered) return;
    this.registered = true;
    this.consumers.registerLane("audit", async (event) => {
      await this.recordAuditEvent(event);
    });
  }

  private async recordAuditEvent(event: DomainEvent) {
    await this.prisma.auditLog.create({
      data: {
        venueId: event.venueId,
        action: event.type,
        targetType: this.targetType(event),
        targetId: this.targetId(event),
        actorStaffId: (event as any).actorStaffId ?? null,
        metadata: this.auditMetadata(event)
      }
    });

    this.logger.logEvent(event.type, this.logMetadata(event), "Audit");
  }

  private targetType(event: DomainEvent) {
    if (event.type === "message.created" && event.messageId) {
      return "message";
    }

    if (event.requestId) {
      return "support_request";
    }

    if (event.messageId) {
      return "message";
    }

    if (event.conversationId) {
      return "conversation";
    }

    return "venue";
  }

  private targetId(event: DomainEvent) {
    if (event.type === "message.created" && event.messageId) {
      return event.messageId;
    }

    return event.requestId ?? event.messageId ?? event.conversationId ?? null;
  }

  private auditMetadata(event: DomainEvent): Prisma.InputJsonObject {
    return {
      eventId: event.eventId ?? null,
      occurredAt: event.occurredAt,
      conversationId: event.conversationId ?? null,
      messageId: event.messageId ?? null,
      requestId: event.requestId ?? null,
      actorStaffId: (event as any).actorStaffId ?? null
    };
  }

  private logMetadata(event: DomainEvent) {
    return {
      eventId: event.eventId,
      venueId: event.venueId,
      requestId: event.requestId,
      conversationId: event.conversationId,
      messageId: event.messageId
    };
  }
}
