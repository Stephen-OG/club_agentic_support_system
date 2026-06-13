import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstValueFrom, take, toArray } from "rxjs";
import { DomainEventsService } from "./domain-events.service";

function mockPrisma() {
  return { eventOutbox: { create: async () => ({}) } } as never;
}

describe("DomainEventsService", () => {
  function withoutGeneratedEventIds(events: unknown[]) {
    return events.map((event) => {
      const { eventId: _eventId, ...rest } = event as Record<string, unknown>;
      return rest;
    });
  }

  it("streams venue events only to matching venue subscribers", async () => {
    const service = new DomainEventsService(mockPrisma());
    const venueEvents = firstValueFrom(service.streamForVenue("venue_1").pipe(take(2), toArray()));

    service.publish({
      type: "request.created",
      venueId: "venue_1",
      requestId: "request_1",
      occurredAt: "2026-06-02T06:00:00.000Z"
    });
    service.publish({
      type: "request.updated",
      venueId: "venue_2",
      requestId: "request_2",
      occurredAt: "2026-06-02T06:01:00.000Z"
    });
    service.publish({
      type: "message.created",
      venueId: "venue_1",
      conversationId: "conversation_1",
      messageId: "message_1",
      occurredAt: "2026-06-02T06:02:00.000Z"
    });

    assert.deepEqual(withoutGeneratedEventIds(await venueEvents), [
      {
        type: "request.created",
        venueId: "venue_1",
        requestId: "request_1",
        occurredAt: "2026-06-02T06:00:00.000Z"
      },
      {
        type: "message.created",
        venueId: "venue_1",
        conversationId: "conversation_1",
        messageId: "message_1",
        occurredAt: "2026-06-02T06:02:00.000Z"
      }
    ]);
  });

  it("streams guest conversation events only to matching conversations", async () => {
    const service = new DomainEventsService(mockPrisma());
    const conversationEvents = firstValueFrom(service.streamForConversation("conversation_1").pipe(take(1), toArray()));

    service.publish({
      type: "message.created",
      venueId: "venue_1",
      conversationId: "conversation_2",
      messageId: "message_2",
      occurredAt: "2026-06-02T06:03:00.000Z"
    });
    service.publish({
      type: "request.updated",
      venueId: "venue_1",
      conversationId: "conversation_1",
      requestId: "request_1",
      occurredAt: "2026-06-02T06:04:00.000Z"
    });

    assert.deepEqual(withoutGeneratedEventIds(await conversationEvents), [
      {
        type: "request.updated",
        venueId: "venue_1",
        conversationId: "conversation_1",
        requestId: "request_1",
        occurredAt: "2026-06-02T06:04:00.000Z"
      }
    ]);
  });

  it("publishes local events to the Redis bus with generated event ids", async () => {
    const published: unknown[] = [];
    const service = new DomainEventsService(mockPrisma(), {
      publish: async (event: unknown) => {
        published.push(event);
      },
      subscribe: async () => undefined
    } as never);

    service.publish({
      type: "request.created",
      venueId: "venue_1",
      requestId: "request_1",
      occurredAt: "2026-06-02T07:10:00.000Z"
    });

    assert.equal(published.length, 1);
    assert.match((published[0] as { eventId: string }).eventId, /^evt_/);
  });

  it("fans remote Redis bus events into local subscribers", async () => {
    let redisHandler: ((event: any) => void) | null = null;
    const service = new DomainEventsService(mockPrisma(), {
      publish: async () => undefined,
      subscribe: async (handler: (event: any) => void) => {
        redisHandler = handler;
      }
    } as never);
    await service.onModuleInit();
    const venueEvents = firstValueFrom(service.streamForVenue("venue_1").pipe(take(1), toArray()));

    assert.ok(redisHandler);
    const handler = redisHandler as (event: any) => void;
    handler({
      eventId: "event_remote",
      type: "request.updated",
      venueId: "venue_1",
      requestId: "request_remote",
      occurredAt: "2026-06-02T07:11:00.000Z"
    });

    assert.deepEqual(await venueEvents, [
      {
        eventId: "event_remote",
        type: "request.updated",
        venueId: "venue_1",
        requestId: "request_remote",
        occurredAt: "2026-06-02T07:11:00.000Z"
      }
    ]);
  });
});
