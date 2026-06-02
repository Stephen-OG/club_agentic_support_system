import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCommandRequestStatusLabel, createGuestRequestStatusLabel } from "./request-display";

describe("request display helpers", () => {
  it("shows guest lifecycle states with guest-facing labels", () => {
    assert.equal(createGuestRequestStatusLabel(null), "Ready");
    assert.equal(createGuestRequestStatusLabel("ACKNOWLEDGED"), "In Progress");
    assert.equal(createGuestRequestStatusLabel("IN_PROGRESS"), "In Progress");
    assert.equal(createGuestRequestStatusLabel("COMPLETED"), "Awaiting rating");
    assert.equal(createGuestRequestStatusLabel("RESOLVED"), "Complete");
  });

  it("formats command request statuses consistently", () => {
    assert.equal(createCommandRequestStatusLabel("NEW"), "New");
    assert.equal(createCommandRequestStatusLabel("IN_PROGRESS"), "In Progress");
    assert.equal(createCommandRequestStatusLabel("COMPLETED"), "Completed");
  });
});
