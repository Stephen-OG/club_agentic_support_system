import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeGuestChatMessages, sanitizeGuestChatBody } from "./guest-chat-messages";

describe("guest chat message normalization", () => {
  it("replaces internal ids in legacy assistant copy with the public service point label", () => {
    assert.equal(
      sanitizeGuestChatBody(
        "Of course. I have notified the team for 7548ab6e-e8ac-4aeb-8867-d2ff290d9b46.",
        "Table 4"
      ),
      "Of course. I have notified the team for Table 4."
    );
  });

  it("removes request ids from legacy follow-up copy", () => {
    assert.equal(
      sanitizeGuestChatBody(
        "Thanks, I added that to your open request for 7548ab6e-e8ac-4aeb-8867-d2ff290d9b46.",
        "Table 4"
      ),
      "Thanks, I added that to your open request."
    );
  });

  it("hides legacy acknowledgement rows and dedupes repeated assistant status copy", () => {
    const messages = normalizeGuestChatMessages(
      [
        {
          id: "acknowledged",
          sender: "system",
          body: "The team has acknowledged your request and will help from here."
        },
        {
          id: "progress-1",
          sender: "system",
          body: "The team is working on this now."
        },
        {
          id: "progress-2",
          sender: "system",
          body: "The team is working on this now."
        },
        {
          id: "guest-repeat",
          sender: "guest",
          body: "Okay"
        },
        {
          id: "guest-repeat-2",
          sender: "guest",
          body: "Okay"
        }
      ],
      "Table 4"
    );

    assert.deepEqual(
      messages.map((message) => message.id),
      ["progress-1", "guest-repeat", "guest-repeat-2"]
    );
  });
});
