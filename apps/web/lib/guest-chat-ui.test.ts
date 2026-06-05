import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldShowGuestIntroActions, shouldShowGuestMessageTimestamp, type GuestChatUiMessage } from "./guest-chat-ui";

const welcome: GuestChatUiMessage = {
  id: "welcome",
  sender: "assistant",
  body: "Hi, I am Lily.",
  createdAt: "2026-06-02T10:00:00.000Z"
};

describe("guest chat UI state", () => {
  it("shows intro actions only before the guest starts a conversation", () => {
    assert.equal(shouldShowGuestIntroActions({ awaitingSatisfaction: false, chatClosed: false, messages: [welcome], requestStatus: null }), true);

    assert.equal(
      shouldShowGuestIntroActions({
        awaitingSatisfaction: false,
        chatClosed: false,
        messages: [
          welcome,
          { id: "guest-1", sender: "guest", body: "Can I see the menu?", createdAt: "2026-06-02T10:00:02.000Z" },
          { id: "pending-1", sender: "assistant", body: "", createdAt: "2026-06-02T10:00:03.000Z", isPending: true }
        ],
        requestStatus: "NEW"
      }),
      false
    );
  });

  it("hides intro actions for closed chat and satisfaction states", () => {
    assert.equal(shouldShowGuestIntroActions({ awaitingSatisfaction: false, chatClosed: true, messages: [welcome], requestStatus: null }), false);
    assert.equal(shouldShowGuestIntroActions({ awaitingSatisfaction: true, chatClosed: false, messages: [welcome], requestStatus: "COMPLETED" }), false);
  });

  it("does not render timestamps for non-persisted welcome or pending messages", () => {
    assert.equal(shouldShowGuestMessageTimestamp(welcome), false);
    assert.equal(
      shouldShowGuestMessageTimestamp({
        id: "pending-1",
        sender: "assistant",
        body: "",
        createdAt: "2026-06-02T10:00:01.000Z",
        isPending: true
      }),
      false
    );
    assert.equal(
      shouldShowGuestMessageTimestamp({
        id: "message-1",
        sender: "guest",
        body: "Can I see the menu?",
        createdAt: "2026-06-02T10:00:02.000Z"
      }),
      true
    );
  });
});
