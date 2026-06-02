import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstValueFrom, take, toArray } from "rxjs";
import { DomainEventsService } from "./domain-events.service";

describe("DomainEventsService", () => {
  it("streams venue events only to matching venue subscribers", async () => {
    const service = new DomainEventsService();
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

    assert.deepEqual(await venueEvents, [
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
    const service = new DomainEventsService();
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

    assert.deepEqual(await conversationEvents, [
      {
        type: "request.updated",
        venueId: "venue_1",
        conversationId: "conversation_1",
        requestId: "request_1",
        occurredAt: "2026-06-02T06:04:00.000Z"
      }
    ]);
  });
});
