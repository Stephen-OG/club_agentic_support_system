import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAgentActionAllowed } from "./agent-policy";

describe("agent policy", () => {
  it("allows safe replies and low-risk assignment in semi-autonomous mode", () => {
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "reply", "normal"), true);
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "assign", "low"), true);
  });

  it("blocks risky semi-autonomous actions", () => {
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "mark_handled", "normal"), false);
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "assign", "urgent"), false);
  });

  it("keeps assistive mode approval-only", () => {
    assert.equal(isAgentActionAllowed("v1-assistive", "reply", "low"), false);
  });
});
