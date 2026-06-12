import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEmailTemplate, emailTemplateDefinitions } from "./email-templates";

describe("email templates", () => {
  it("defines every transactional email category with a stable key and subject", () => {
    assert.deepEqual(
      emailTemplateDefinitions.map((template) => ({ key: template.key, name: template.name })),
      [
        { key: "email_verification", name: "Email Verification" },
        { key: "password_reset", name: "Password Reset" },
        { key: "staff_invitation", name: "Staff Invitation" }
      ]
    );
  });

  it("renders email verification with explicit text and html bodies", () => {
    const rendered = renderEmailTemplate("email_verification", {
      appName: "Madupe",
      displayName: "Alex",
      verificationCode: "123456"
    });

    assert.match(rendered.subject, /Verify your Madupe email/);
    assert.match(rendered.text, /123456/);
    assert.doesNotMatch(rendered.text, /https:\/\//);
    assert.match(rendered.html, /123456/);
  });

  it("renders password reset as a code without a link", () => {
    const rendered = renderEmailTemplate("password_reset", {
      appName: "Madupe",
      displayName: "Alex",
      verificationCode: "654321"
    });

    assert.match(rendered.subject, /Reset your Madupe password/);
    assert.match(rendered.text, /654321/);
    assert.doesNotMatch(rendered.text, /https:\/\//);
    assert.match(rendered.html, /654321/);
  });
});
