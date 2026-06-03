import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyOpenRequestGuestMessage } from "./guest-followup-intent";

describe("guest follow-up intent", () => {
  it("treats courtesy-only follow-ups as acknowledgements", () => {
    assert.equal(classifyOpenRequestGuestMessage("Thank you"), "courtesy");
    assert.equal(classifyOpenRequestGuestMessage("thanks, Lily!"), "courtesy");
    assert.equal(classifyOpenRequestGuestMessage("Okay"), "courtesy");
  });

  it("treats new asks after an open request as new request content", () => {
    assert.equal(classifyOpenRequestGuestMessage("Can we also get water?"), "new_request");
    assert.equal(classifyOpenRequestGuestMessage("My friend needs help too"), "new_request");
  });

  it("keeps greetings and conversational follow-ups out of the operations queue", () => {
    assert.equal(classifyOpenRequestGuestMessage("Hello"), "conversation");
    assert.equal(classifyOpenRequestGuestMessage("How are you?"), "conversation");
    assert.equal(classifyOpenRequestGuestMessage("Wait why is your name Lily?"), "conversation");
  });
});
