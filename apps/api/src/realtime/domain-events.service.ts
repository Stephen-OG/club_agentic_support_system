import { Injectable } from "@nestjs/common";
import { filter, Observable, Subject } from "rxjs";

export type DomainEventType = "request.created" | "request.updated" | "message.created";

export type DomainEvent = {
  type: DomainEventType;
  venueId: string;
  occurredAt: string;
  requestId?: string;
  conversationId?: string;
  messageId?: string;
};

@Injectable()
export class DomainEventsService {
  private readonly events = new Subject<DomainEvent>();

  publish(event: DomainEvent) {
    this.events.next(event);
  }

  streamForVenue(venueId: string): Observable<DomainEvent> {
    return this.events.pipe(filter((event) => event.venueId === venueId));
  }

  streamForConversation(conversationId: string): Observable<DomainEvent> {
    return this.events.pipe(filter((event) => event.conversationId === conversationId));
  }
}
