import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSseMessages, shouldRefreshForRealtimeEvent } from "./realtime-events";

describe("realtime event helpers", () => {
  it("parses typed SSE messages from text chunks", () => {
    assert.deepEqual(
      parseSseMessages(
        'event: request.created\ndata: {"type":"request.created","venueId":"venue_1","requestId":"request_1","occurredAt":"2026-06-02T06:30:00.000Z"}\n\n'
      ),
      [
        {
          type: "request.created",
          venueId: "venue_1",
          requestId: "request_1",
          occurredAt: "2026-06-02T06:30:00.000Z"
        }
      ]
    );
  });

  it("refreshes for request and message domain events only", () => {
    assert.equal(shouldRefreshForRealtimeEvent({ type: "request.created" }), true);
    assert.equal(shouldRefreshForRealtimeEvent({ type: "request.updated" }), true);
    assert.equal(shouldRefreshForRealtimeEvent({ type: "message.created" }), true);
    assert.equal(shouldRefreshForRealtimeEvent({ type: "heartbeat" }), false);
  });
});
