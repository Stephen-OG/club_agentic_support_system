import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RedisDomainEventConsumerAdapter, type RedisConsumerClient } from "./redis-domain-event-consumer.adapter";

describe("RedisDomainEventConsumerAdapter", () => {
  it("creates consumer groups and reads domain events for a lane", async () => {
    const calls: unknown[] = [];
    let readCount = 0;
    let releaseRead: (() => void) | undefined;
    const firstReadReady = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const client: RedisConsumerClient = {
      xack: async () => undefined,
      xadd: async () => "dlq_id",
      xgroup: async (...args: unknown[]) => {
        calls.push({ command: "xgroup", args });
        return "OK";
      },
      xreadgroup: async (...args: unknown[]) => {
        calls.push({ command: "xreadgroup", args });
        if (readCount > 0) {
          return null;
        }
        readCount += 1;
        await firstReadReady;

        return [
          [
            "guestos:domain-events",
            [
              [
                "redis_id_1",
                [
                  "payload",
                  JSON.stringify({
                    event: {
                      eventId: "evt_1",
                      type: "request.created",
                      venueId: "venue_1",
                      occurredAt: "2026-06-02T08:10:00.000Z"
                    },
                    originId: "instance_1"
                  })
                ]
              ]
            ]
          ]
        ];
      },
      disconnect: () => undefined
    };
    const adapter = new RedisDomainEventConsumerAdapter(client, { blockMs: 1, consumerName: "consumer_1", stream: "guestos:domain-events" });
    const messages: unknown[] = [];
    let stop: (() => void) | void;

    stop = await adapter.start("notifications", async (messageId, event) => {
      messages.push({ messageId, event });
      stop?.();
    });
    releaseRead?.();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(messages, [
      {
        messageId: "redis_id_1",
        event: {
          eventId: "evt_1",
          type: "request.created",
          venueId: "venue_1",
          occurredAt: "2026-06-02T08:10:00.000Z"
        }
      }
    ]);
    assert.deepEqual(calls[0], {
      command: "xgroup",
      args: ["CREATE", "guestos:domain-events", "guestos:notifications", "$", "MKSTREAM"]
    });
  });

  it("acknowledges and dead-letters lane messages", async () => {
    const calls: unknown[] = [];
    const client: RedisConsumerClient = {
      xack: async (...args: unknown[]) => {
        calls.push({ command: "xack", args });
        return 1;
      },
      xadd: async (...args: unknown[]) => {
        calls.push({ command: "xadd", args });
        return "dlq_id";
      },
      xgroup: async () => "OK",
      xreadgroup: async () => null,
      disconnect: () => undefined
    };
    const adapter = new RedisDomainEventConsumerAdapter(client);

    await adapter.acknowledge("webhooks", "redis_id_2");
    await adapter.deadLetter(
      "webhooks",
      "redis_id_2",
      {
        eventId: "evt_2",
        type: "message.created",
        venueId: "venue_1",
        occurredAt: "2026-06-02T08:11:00.000Z"
      },
      "webhook failed"
    );

    assert.equal((calls[0] as any).command, "xack");
    assert.deepEqual((calls[0] as any).args, ["guestos:domain-events", "guestos:webhooks", "redis_id_2"]);
    assert.equal((calls[1] as any).command, "xadd");
    assert.equal((calls[1] as any).args[0], "guestos:domain-events:dead-letter");
  });

  it("claims pending lane messages before waiting for new stream entries", async () => {
    const calls: unknown[] = [];
    let claimed = false;
    const client: RedisConsumerClient & { xautoclaim: (...args: unknown[]) => Promise<unknown> } = {
      xack: async () => undefined,
      xadd: async () => "dlq_id",
      xautoclaim: async (...args: unknown[]) => {
        calls.push({ command: "xautoclaim", args });
        if (claimed) {
          return ["0-0", []];
        }
        claimed = true;
        return [
          "0-0",
          [
            [
              "redis_pending_1",
              [
                "payload",
                JSON.stringify({
                  event: {
                    eventId: "evt_pending_1",
                    type: "message.created",
                    venueId: "venue_1",
                    occurredAt: "2026-06-02T08:12:00.000Z"
                  },
                  originId: "instance_2"
                })
              ]
            ]
          ]
        ];
      },
      xgroup: async () => "OK",
      xreadgroup: async () => null,
      disconnect: () => undefined
    };
    const adapter = new RedisDomainEventConsumerAdapter(client, { blockMs: 1, consumerName: "consumer_1", pendingIdleMs: 0 });
    const messages: unknown[] = [];

    const stop = await adapter.start("audit", async (messageId, event) => {
      messages.push({ messageId, event });
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    stop?.();

    assert.equal((calls[0] as any).command, "xautoclaim");
    assert.deepEqual(messages, [
      {
        messageId: "redis_pending_1",
        event: {
          eventId: "evt_pending_1",
          type: "message.created",
          venueId: "venue_1",
          occurredAt: "2026-06-02T08:12:00.000Z"
        }
      }
    ]);
  });
});
