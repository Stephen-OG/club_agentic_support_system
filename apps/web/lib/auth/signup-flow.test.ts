import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSignupCompletionAction, getSignupEmailRedirectTo, getSignupSlugError, normalizeSignupSlug } from "./signup-flow";

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

  it("normalizes workspace and venue slugs", () => {
    assert.equal(normalizeSignupSlug(" The Grand Lounge!! "), "the-grand-lounge");
    assert.equal(normalizeSignupSlug("Tesco__Oxford---Street"), "tesco-oxford-street");
  });

  it("validates setup slugs before submission", () => {
    assert.equal(getSignupSlugError("Workspace", "lost-mary"), null);
    assert.equal(getSignupSlugError("Workspace", ""), "Workspace slug is required.");
    assert.equal(getSignupSlugError("Venue", "ab"), "Venue slug must be at least 3 characters.");
    assert.equal(
      getSignupSlugError("Venue", "bad--slug"),
      "Venue slug can only use lowercase letters, numbers, and single hyphens."
    );
  });

  it("redirects verification emails back to login", () => {
    assert.equal(getSignupEmailRedirectTo("https://app.example.com/"), "https://app.example.com/login");
  });
});
