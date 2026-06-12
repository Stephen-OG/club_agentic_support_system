import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAuthEntryHref,
  getLoginModeFromSearchParams,
  getSignupCompletionAction,
  getSignupSlugError,
  normalizeSignupSlug
} from "./signup-flow";

describe("signup flow", () => {
  it("sends signed-in new users to organization setup", () => {
    assert.deepEqual(getSignupCompletionAction({ hasSession: true }), {
      kind: "setup"
    });
  });

  it("keeps unverified signups on an email confirmation state", () => {
    assert.deepEqual(getSignupCompletionAction({ hasSession: false }), {
      kind: "verify-email"
    });
  });

  it("normalizes organization and venue slugs", () => {
    assert.equal(normalizeSignupSlug(" The Grand Lounge!! "), "the-grand-lounge");
    assert.equal(normalizeSignupSlug("Tesco__Oxford---Street"), "tesco-oxford-street");
  });

  it("validates setup slugs before submission", () => {
    assert.equal(getSignupSlugError("Organization", "lost-mary"), null);
    assert.equal(getSignupSlugError("Organization", ""), "Organization slug is required.");
    assert.equal(getSignupSlugError("Venue", "ab"), "Venue slug must be at least 3 characters.");
    assert.equal(
      getSignupSlugError("Venue", "bad--slug"),
      "Venue slug can only use lowercase letters, numbers, and single hyphens."
    );
  });

  it("points public signup entry to the create account mode on login", () => {
    assert.equal(getAuthEntryHref("signin"), "/login");
    assert.equal(getAuthEntryHref("signup"), "/login?mode=signup");
    assert.equal(getLoginModeFromSearchParams(new URLSearchParams("mode=signup")), "signup");
    assert.equal(getLoginModeFromSearchParams(new URLSearchParams("mode=reset_confirm&email=sam%40example.com")), "reset_confirm");
    assert.equal(getLoginModeFromSearchParams(new URLSearchParams("")), "signin");
  });
});
