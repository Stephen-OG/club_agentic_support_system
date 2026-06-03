import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSignupCompletionAction } from "./signup-flow";

describe("signup flow", () => {
  it("sends signed-in new users to workspace setup", () => {
    assert.deepEqual(getSignupCompletionAction({ hasSession: true }), {
      kind: "setup"
    });
  });

  it("keeps unverified signups on an email confirmation state", () => {
    assert.deepEqual(getSignupCompletionAction({ hasSession: false }), {
      kind: "verify-email"
    });
  });
});
