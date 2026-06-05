import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DomainEvent } from "../realtime/domain-events.service";
import { AuditEventsConsumer } from "./audit-events.consumer";

const baseEvent: DomainEvent = {
  eventId: "evt_smoke",
  type: "request.created",
  venueId: "00000000-0000-0000-0000-000000000001",
  occurredAt: "2026-06-05T00:00:00.000Z",
  requestId: "00000000-0000-0000-0000-000000000002",
  conversationId: "00000000-0000-0000-0000-000000000003",
  messageId: "00000000-0000-0000-0000-000000000004"
};

describe("AuditEventsConsumer", () => {
  it("persists domain events to the audit log without guest message bodies", async () => {
    const registered: Array<{ lane: string; handler: (event: typeof baseEvent) => Promise<void> }> = [];
    const writes: unknown[] = [];
    const logEvents: unknown[] = [];
    const consumer = new AuditEventsConsumer(
      {
        registerLane(lane: string, handler: (event: typeof baseEvent) => Promise<void>) {
          registered.push({ lane, handler });
        }
      } as never,
      {
        auditLog: {
          create: async (input: unknown) => {
            writes.push(input);
            return input;
          }
        }
      } as never,
      {
        logEvent: (event: string, metadata: unknown, context: string) => logEvents.push({ event, metadata, context })
      } as never
    );

    consumer.onModuleInit();
    const auditLane = registered[0];
    assert.ok(auditLane);
    await auditLane.handler(baseEvent);

    assert.equal(auditLane.lane, "audit");
    assert.deepEqual(writes, [
      {
        data: {
          venueId: baseEvent.venueId,
          action: "request.created",
          targetType: "support_request",
          targetId: baseEvent.requestId,
          metadata: {
            eventId: baseEvent.eventId,
            occurredAt: baseEvent.occurredAt,
            conversationId: baseEvent.conversationId,
            messageId: baseEvent.messageId,
            requestId: baseEvent.requestId
          }
        }
      }
    ]);
    assert.equal(JSON.stringify(writes).includes("body"), false);
    assert.deepEqual(logEvents, [
      {
        event: "request.created",
        metadata: {
          eventId: baseEvent.eventId,
          venueId: baseEvent.venueId,
          requestId: baseEvent.requestId,
          conversationId: baseEvent.conversationId,
          messageId: baseEvent.messageId
        },
        context: "Audit"
      }
    ]);
  });

  it("targets message audit rows for message-created events", async () => {
    const registered: Array<{ lane: string; handler: (event: typeof baseEvent) => Promise<void> }> = [];
    const writes: unknown[] = [];
    const consumer = new AuditEventsConsumer(
      {
        registerLane(lane: string, handler: (event: typeof baseEvent) => Promise<void>) {
          registered.push({ lane, handler });
        }
      } as never,
      {
        auditLog: {
          create: async (input: unknown) => {
            writes.push(input);
            return input;
          }
        }
      } as never,
      { logEvent: () => undefined } as never
    );

    consumer.onModuleInit();
    const auditLane = registered[0];
    assert.ok(auditLane);
    await auditLane.handler({ ...baseEvent, type: "message.created" });

    assert.equal((writes[0] as any).data.targetType, "message");
    assert.equal((writes[0] as any).data.targetId, baseEvent.messageId);
  });
});
