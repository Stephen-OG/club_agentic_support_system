import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReplyGuardService } from "./reply-guard.service";

describe("ReplyGuardService", () => {
  it("keeps normal request replies free of internal request or service point identifiers", () => {
    const service = new ReplyGuardService();

    assert.equal(
      service.createGuestReply("normal", "7548ab6e-e8ac-4aeb-8867-d2ff290d9b46"),
      "Of course. I have notified the team."
    );
    assert.equal(
      service.createGuestReply("normal", "7548ab6e-e8ac-4aeb-8867-d2ff290d9b46", true),
      "Thanks, I added that to your open request."
    );
  });

  it("uses friendly locations only when they are guest-meaningful", () => {
    const service = new ReplyGuardService();

    assert.equal(service.createGuestReply("normal", "Table 4"), "Of course. I have notified the team for Table 4.");
    assert.equal(
      service.createGuestReply("urgent", "Main bar"),
      "I have alerted the team that Main bar needs urgent support. Please stay where you are if it is safe to do so."
    );
  });
});
