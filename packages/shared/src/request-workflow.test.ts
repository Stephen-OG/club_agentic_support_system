import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransitionRequest, getNextGuestActionStatus } from "./request-workflow";

describe("request workflow", () => {
  it("allows staff to move acknowledged or in-progress requests forward", () => {
    assert.equal(canTransitionRequest("acknowledged", "in_progress", "staff"), true);
    assert.equal(canTransitionRequest("in_progress", "completed", "staff"), true);
  });

  it("prevents staff from resolving without guest confirmation", () => {
    assert.equal(canTransitionRequest("completed", "resolved", "staff"), false);
  });

  it("allows guest resolution confirmation from completed", () => {
    assert.equal(getNextGuestActionStatus("completed", "confirm_resolved"), "resolved");
    assert.equal(getNextGuestActionStatus("completed", "not_satisfied"), "in_progress");
  });

  it("rejects guest actions from the wrong state", () => {
    assert.throws(() => getNextGuestActionStatus("new", "confirm_resolved"), /not awaiting satisfaction/);
  });

  it("prevents guests from cancelling escalated requests", () => {
    assert.throws(() => getNextGuestActionStatus("escalated", "cancel"), /can no longer be cancelled/);
  });
});
