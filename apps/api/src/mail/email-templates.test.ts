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
      actionUrl: "https://madupe.com/verify?token=abc",
      appName: "Madupe",
      displayName: "Alex"
    });

    assert.match(rendered.subject, /Verify your Madupe email/);
    assert.match(rendered.text, /https:\/\/madupe\.com\/verify\?token=abc/);
    assert.match(rendered.html, /Verify email/);
  });
});
