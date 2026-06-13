import { randomUUID } from "node:crypto";
import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Observable, Subject } from "rxjs";
import { filter, finalize, tap, timeout } from "rxjs/operators";
import { PrismaService } from "../database/prisma.service";
import { RedisDomainEventBusService } from "./redis-domain-event-bus.service";

export type DomainEventType = "request.created" | "request.updated" | "request.escalated" | "message.created";

export type DomainEvent = {
  eventId?: string;
  type: DomainEventType;
  venueId: string;
  occurredAt: string;
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  actorStaffId?: string;
};

type PrismaTransaction = Prisma.TransactionClient;

const eventFields = ["eventId", "type", "venueId", "occurredAt", "requestId", "conversationId", "messageId", "actorStaffId"] as const;

function pickEventPayload(event: DomainEvent) {
  const payload: Record<string, unknown> = {};
  for (const field of eventFields) {
    const value = (event as any)[field];
    if (value !== undefined) {
      payload[field] = value;
    }
  }
  return payload as Prisma.InputJsonValue;
}

@Injectable()
export class DomainEventsService implements OnModuleInit {
  private readonly events = new Subject<DomainEvent>();
  private readonly logger = new Logger(DomainEventsService.name);
  private activeSubscriptions = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisBus?: RedisDomainEventBusService
  ) {}

  private trackSubscription(id: string) {
    this.activeSubscriptions.add(id);
  }

  private untrackSubscription(id: string) {
    this.activeSubscriptions.delete(id);
  }

  async onModuleInit() {
    await this.redisBus?.subscribe((event) => {
      this.events.next(event);
    });
  }

  async writeOutbox(tx: PrismaTransaction, event: DomainEvent) {
    await tx.eventOutbox.create({
      data: {
        eventType: event.type,
        venueId: event.venueId,
        payload: pickEventPayload(event)
      }
    });
  }

  publish(event: DomainEvent) {
    const eventWithId = {
      ...event,
      eventId: event.eventId ?? `evt_${randomUUID()}`
    };

    this.events.next(eventWithId);
    void this.redisBus?.publish(eventWithId);
  }

  streamForVenue(venueId: string): Observable<DomainEvent> {
    const subId = `venue:${venueId}`;
    return this.events.pipe(
      filter((event) => event.venueId === venueId),
      timeout(30 * 60 * 1000),
      finalize(() => {
        this.logger.log(`Subscription for venue ${venueId} ended`);
        this.untrackSubscription(subId);
      }),
      tap({ subscribe: () => this.trackSubscription(subId) })
    );
  }

  streamForConversation(conversationId: string): Observable<DomainEvent> {
    const subId = `conversation:${conversationId}`;
    return this.events.pipe(
      filter((event) => event.conversationId === conversationId),
      timeout(30 * 60 * 1000),
      finalize(() => {
        this.logger.log(`Subscription for conversation ${conversationId} ended`);
        this.untrackSubscription(subId);
      }),
      tap({ subscribe: () => this.trackSubscription(subId) })
    );
  }
}
