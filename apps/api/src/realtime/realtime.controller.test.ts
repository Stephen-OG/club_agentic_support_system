import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstValueFrom, take } from "rxjs";
import { DomainEventsService } from "./domain-events.service";
import { RealtimeController } from "./realtime.controller";

describe("RealtimeController", () => {
  function withoutGeneratedEventId(message: unknown) {
    const sseMessage = message as { type: string; data: Record<string, unknown> };
    const { eventId: _eventId, ...data } = sseMessage.data;
    return { ...sseMessage, data };
  }

  it("authorizes venue streams before returning SSE events", async () => {
    const events = new DomainEventsService();
    const accessCalls: unknown[] = [];
    const controller = new RealtimeController(
      events,
      {
        venue: {
          findFirst: async (args: unknown) => {
            accessCalls.push(args);
            return { id: "venue_1", organizationId: "workspace_1" };
          }
        }
      } as never,
      {
        assertCanReadVenue: (auth: unknown, venue: unknown) => {
          accessCalls.push({ auth, venue });
        }
      } as never
    );

    const stream = await controller.streamVenueEvents(
      { organizationId: "workspace_1", role: "manager" } as never,
      "venue_1"
    );
    const nextEvent = firstValueFrom(stream.pipe(take(1)));

    events.publish({
      type: "request.created",
      venueId: "venue_1",
      requestId: "request_1",
      occurredAt: "2026-06-02T06:10:00.000Z"
    });

    assert.deepEqual(withoutGeneratedEventId(await nextEvent), {
      type: "request.created",
      data: {
        type: "request.created",
        venueId: "venue_1",
        requestId: "request_1",
        occurredAt: "2026-06-02T06:10:00.000Z"
      }
    });
    assert.deepEqual(accessCalls, [
      { where: { id: "venue_1" }, select: { id: true, organizationId: true } },
      {
        auth: { organizationId: "workspace_1", role: "manager" },
        venue: { organizationId: "workspace_1", venueId: "venue_1" }
      }
    ]);
  });

  it("requires the guest session to match before streaming conversation events", async () => {
    const events = new DomainEventsService();
    const controller = new RealtimeController(
      events,
      {
        venue: {
          findFirst: async () => null
        },
        conversation: {
          findFirst: async (args: unknown) => {
            assert.deepEqual(args, {
              where: {
                id: "conversation_1",
                qrPoint: {
                  qrToken: "qr_token_1",
                  isActive: true
                }
              },
              select: {
                id: true,
                guestSessionId: true
              }
            });
            return { id: "conversation_1", guestSessionId: "guest_session_1" };
          }
        }
      } as never,
      { assertCanReadVenue: () => undefined } as never
    );

    const stream = await controller.streamGuestConversationEvents("qr_token_1", "conversation_1", "guest_session_1");
    const nextEvent = firstValueFrom(stream.pipe(take(1)));

    events.publish({
      type: "message.created",
      venueId: "venue_1",
      conversationId: "conversation_1",
      messageId: "message_1",
      occurredAt: "2026-06-02T06:11:00.000Z"
    });

    assert.deepEqual(withoutGeneratedEventId(await nextEvent), {
      type: "message.created",
      data: {
        type: "message.created",
        venueId: "venue_1",
        conversationId: "conversation_1",
        messageId: "message_1",
        occurredAt: "2026-06-02T06:11:00.000Z"
      }
    });
  });
});
