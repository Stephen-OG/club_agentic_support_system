import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuestStatusMessage } from "./guest-status-copy";

describe("guest status copy", () => {
  it("keeps acknowledgement silent and active/completed updates guest friendly", () => {
    assert.equal(createGuestStatusMessage("acknowledged"), undefined);
    assert.equal(createGuestStatusMessage("in_progress"), "The team is working on this now.");
    assert.equal(createGuestStatusMessage("completed"), "The team marked this complete. How did it go?");
  });
});
