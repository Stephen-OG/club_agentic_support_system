import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePasswordChange } from "./account-security";

describe("account security", () => {
  it("requires old, new, and confirmed passwords", () => {
    assert.equal(validatePasswordChange({ oldPassword: "", newPassword: "long-enough-password", confirmPassword: "long-enough-password" }), "Enter your old password.");
    assert.equal(validatePasswordChange({ oldPassword: "temporary-pass", newPassword: "", confirmPassword: "" }), "Enter a new password.");
    assert.equal(validatePasswordChange({ oldPassword: "temporary-pass", newPassword: "long-enough-password", confirmPassword: "" }), "Confirm your new password.");
  });

  it("validates new password length and confirmation match", () => {
    assert.equal(validatePasswordChange({ oldPassword: "temporary-pass", newPassword: "short", confirmPassword: "short" }), "Use at least 10 characters for the new password.");
    assert.equal(validatePasswordChange({ oldPassword: "temporary-pass", newPassword: "long-enough-password", confirmPassword: "different-password" }), "Passwords do not match.");
    assert.equal(validatePasswordChange({ oldPassword: "temporary-pass", newPassword: "long-enough-password", confirmPassword: "long-enough-password" }), null);
  });
});
