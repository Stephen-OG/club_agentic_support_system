import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RedisDomainEventBusService, type RedisDomainEventBusAdapter } from "./redis-domain-event-bus.service";

describe("RedisDomainEventBusService", () => {
  it("writes domain events to Redis Streams with an instance origin", async () => {
    const writes: unknown[] = [];
    const adapter: RedisDomainEventBusAdapter = {
      append: async (stream, payload) => {
        writes.push({ stream, payload });
      },
      subscribe: async () => undefined
    };
    const service = new RedisDomainEventBusService(adapter, "instance_1");

    await service.publish({
      type: "request.created",
      venueId: "venue_1",
      requestId: "request_1",
      occurredAt: "2026-06-02T07:00:00.000Z",
      eventId: "event_1"
    });

    assert.deepEqual(writes, [
      {
        stream: "guestos:domain-events",
        payload: {
          originId: "instance_1",
          event: {
            type: "request.created",
            venueId: "venue_1",
            requestId: "request_1",
            occurredAt: "2026-06-02T07:00:00.000Z",
            eventId: "event_1"
          }
        }
      }
    ]);
  });

  it("subscribes to events from other instances and ignores its own echoes", async () => {
    const adapter: RedisDomainEventBusAdapter = {
      append: async () => undefined,
      subscribe: async (_stream, onPayload) => {
        onPayload({
          originId: "instance_1",
          event: {
            type: "request.updated",
            venueId: "venue_1",
            requestId: "own_request",
            occurredAt: "2026-06-02T07:01:00.000Z",
            eventId: "event_own"
          }
        });
        onPayload({
          originId: "instance_2",
          event: {
            type: "request.updated",
            venueId: "venue_1",
            requestId: "remote_request",
            occurredAt: "2026-06-02T07:02:00.000Z",
            eventId: "event_remote"
          }
        });
      }
    };
    const service = new RedisDomainEventBusService(adapter, "instance_1");
    const received: unknown[] = [];

    await service.subscribe((event) => received.push(event));

    assert.deepEqual(received, [
      {
        type: "request.updated",
        venueId: "venue_1",
        requestId: "remote_request",
        occurredAt: "2026-06-02T07:02:00.000Z",
        eventId: "event_remote"
      }
    ]);
  });
});
