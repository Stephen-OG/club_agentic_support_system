import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuestRequestStatusLabel } from "./request-display";

describe("request display helpers", () => {
  it("shows acknowledged guest requests as in progress", () => {
    assert.equal(createGuestRequestStatusLabel(null), "Ready");
    assert.equal(createGuestRequestStatusLabel("ACKNOWLEDGED"), "In Progress");
    assert.equal(createGuestRequestStatusLabel("IN_PROGRESS"), "In Progress");
    assert.equal(createGuestRequestStatusLabel("RESOLVED"), "Complete");
  });
});
