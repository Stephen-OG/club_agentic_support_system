import { randomUUID } from "node:crypto";
import { Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { filter, Observable, Subject } from "rxjs";
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
};

@Injectable()
export class DomainEventsService implements OnModuleInit {
  private readonly events = new Subject<DomainEvent>();

  constructor(@Optional() private readonly redisBus?: RedisDomainEventBusService) {}

  async onModuleInit() {
    await this.redisBus?.subscribe((event) => {
      this.events.next(event);
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
    return this.events.pipe(filter((event) => event.venueId === venueId));
  }

  streamForConversation(conversationId: string): Observable<DomainEvent> {
    return this.events.pipe(filter((event) => event.conversationId === conversationId));
  }
}
