import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileGuestConversationMessages, type GuestChatMessage } from "./guest-chat-state";

const welcome: GuestChatMessage = {
  id: "welcome",
  sender: "assistant",
  body: "Hi",
  createdAt: "2026-06-02T10:00:00.000Z"
};

describe("guest chat state reconciliation", () => {
  it("keeps one stable pending assistant message while the server reply is pending", () => {
    const pending: GuestChatMessage = {
      id: "pending-local",
      sender: "assistant",
      body: "",
      createdAt: "2026-06-02T10:00:01.000Z",
      isPending: true
    };

    const result = reconcileGuestConversationMessages({
      currentMessages: [welcome, { id: "draft", sender: "guest", body: "My order is missing.", createdAt: "2026-06-02T10:00:02.000Z" }, pending],
      replyPending: true,
      serverMessages: [
        {
          id: "persisted-guest",
          sender: "guest",
          body: "My order is missing.",
          createdAt: "2026-06-02T10:00:02.000Z"
        }
      ],
      servicePointLabel: "Table 4",
      welcomeMessage: welcome
    });

    assert.deepEqual(
      result.map((message) => message.id),
      ["welcome", "persisted-guest", "pending-local"]
    );
    assert.equal(result.filter((message) => message.isPending).length, 1);
  });

  it("removes the pending loader once an assistant response is present", () => {
    const result = reconcileGuestConversationMessages({
      currentMessages: [
        welcome,
        { id: "pending-local", sender: "assistant", body: "", createdAt: "2026-06-02T10:00:03.000Z", isPending: true }
      ],
      replyPending: false,
      serverMessages: [
        { id: "persisted-guest", sender: "guest", body: "I need water.", createdAt: "2026-06-02T10:00:01.000Z" },
        { id: "assistant-reply", sender: "assistant", body: "Of course.", createdAt: "2026-06-02T10:00:02.000Z" }
      ],
      servicePointLabel: "Table 4",
      welcomeMessage: welcome
    });

    assert.deepEqual(
      result.map((message) => message.id),
      ["welcome", "persisted-guest", "assistant-reply"]
    );
  });
});
