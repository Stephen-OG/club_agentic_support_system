import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAssistantReply,
  createClosedVenueBody,
  createFollowupReply,
  createGuestStatusMessage,
  createSatisfactionReply,
  createServiceRecoveryReply,
  createVenueWelcomeBody,
  createWelcomeBody
} from "./chat-copy";

describe("chat copy", () => {
  it("greets guests like a helpful host", () => {
    assert.equal(
      createWelcomeBody("Table 1"),
      "Hi, I'm Lily. You're chatting from Table 1. What can I help with?"
    );
    assert.equal(
      createVenueWelcomeBody("Blue Note"),
      "Hi, I'm Lily, your Blue Note concierge. Tell me where you are and what you need, and I will get it to the team."
    );
  });

  it("uses Lily for closed-hours guest chat copy", () => {
    assert.equal(
      createClosedVenueBody(),
      "Lily is offline while the venue is closed. Please come back during opening hours or speak to a team member nearby if it is urgent."
    );
  });

  it("keeps follow-up replies conversational", () => {
    assert.equal(
      createFollowupReply(),
      "Got it, I added that to your open request so the team has the full picture."
    );
  });

  it("responds warmly when the guest still needs help", () => {
    assert.equal(
      createServiceRecoveryReply(),
      "Thanks for letting us know. I have reopened this for the team, and they will keep working on it."
    );
  });

  it("turns staff status updates into guest-friendly chat messages", () => {
    assert.equal(createGuestStatusMessage("acknowledged"), "The team has picked this up and will help from here.");
    assert.equal(createGuestStatusMessage("completed"), "The team marked this complete. How did it go?");
  });

  it("thanks guests for ratings in a friendly way", () => {
    assert.equal(createSatisfactionReply(5), "Thank you. You rated this service 5/5, and we really appreciate the feedback.");
  });

  it("keeps urgent replies calm and direct", () => {
    assert.equal(
      createAssistantReply("urgent", "Table 4"),
      "I have alerted the team that Table 4 needs urgent support. Please stay where you are if it is safe to do so."
    );
  });
});
