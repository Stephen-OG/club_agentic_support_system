import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicQrController } from "./public-qr.controller";

describe("PublicQrController", () => {
  it("reads guest conversation session ids from headers instead of query strings", () => {
    const calls: unknown[] = [];
    const controller = new PublicQrController({
      getGuestConversation: (...args: unknown[]) => {
        calls.push(args);
      },
      getVenueGuestConversation: (...args: unknown[]) => {
        calls.push(args);
      }
    } as never);

    controller.getGuestConversation("qr-token", "conversation-1", "guest_session_123");
    controller.getVenueGuestConversation("venue-slug", "conversation-2", "guest_session_456");

    assert.deepEqual(calls, [
      ["qr-token", "conversation-1", "guest_session_123"],
      ["venue-slug", "conversation-2", "guest_session_456"]
    ]);
  });
});
