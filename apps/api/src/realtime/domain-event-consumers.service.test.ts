import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainEventConsumerService, type DomainEventConsumerAdapter } from "./domain-event-consumers.service";
import type { DomainEvent } from "./domain-events.service";

const event: DomainEvent = {
  eventId: "evt_1",
  type: "request.created",
  venueId: "venue_1",
  requestId: "request_1",
  occurredAt: "2026-06-02T08:00:00.000Z"
};

describe("DomainEventConsumerService", () => {
  it("routes domain events to each consumer lane and acknowledges success", async () => {
    const calls: string[] = [];
    const adapter: DomainEventConsumerAdapter = {
      acknowledge: async (lane, messageId) => {
        calls.push(`ack:${lane}:${messageId}`);
      },
      deadLetter: async () => undefined
    };
    const service = new DomainEventConsumerService(adapter);
    service.registerLane("notifications", async (nextEvent) => {
      calls.push(`notifications:${nextEvent.type}`);
    });
    service.registerLane("analytics", async (nextEvent) => {
      calls.push(`analytics:${nextEvent.type}`);
    });

    await service.processMessage("notifications", "redis_id_1", event);
    await service.processMessage("analytics", "redis_id_2", event);

    assert.deepEqual(calls, [
      "notifications:request.created",
      "ack:notifications:redis_id_1",
      "analytics:request.created",
      "ack:analytics:redis_id_2"
    ]);
  });

  it("retries failed events before dead-lettering", async () => {
    const calls: unknown[] = [];
    const adapter: DomainEventConsumerAdapter = {
      acknowledge: async (lane, messageId) => {
        calls.push({ lane, messageId, type: "ack" });
      },
      deadLetter: async (lane, messageId, nextEvent, error) => {
        calls.push({ lane, messageId, eventId: nextEvent.eventId, error, type: "deadLetter" });
      }
    };
    const service = new DomainEventConsumerService(adapter, { maxAttempts: 2 });
    service.registerLane("webhooks", async () => {
      throw new Error("delivery failed");
    });

    await service.processMessage("webhooks", "redis_id_1", event);
    await service.processMessage("webhooks", "redis_id_1", event);

    assert.deepEqual(calls, [
      {
        lane: "webhooks",
        messageId: "redis_id_1",
        eventId: "evt_1",
        error: "delivery failed",
        type: "deadLetter"
      },
      {
        lane: "webhooks",
        messageId: "redis_id_1",
        type: "ack"
      }
    ]);
  });

  it("starts a stream consumer for registered lanes", async () => {
    const started: string[] = [];
    const adapter: DomainEventConsumerAdapter = {
      start: async (lane, onMessage) => {
        started.push(lane);
        await onMessage("redis_id_1", event);
      },
      acknowledge: async (lane, messageId) => {
        started.push(`ack:${lane}:${messageId}`);
      },
      deadLetter: async () => undefined
    };
    const service = new DomainEventConsumerService(adapter);

    service.registerLane("audit", async (nextEvent) => {
      started.push(`audit:${nextEvent.type}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(started, ["audit", "audit:request.created", "ack:audit:redis_id_1"]);
  });
});
