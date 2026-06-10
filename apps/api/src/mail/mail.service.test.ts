import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MailService } from "./mail.service";

describe("MailService", () => {
  it("sends a named template through the configured SMTP transport", async () => {
    const sent: unknown[] = [];
    const service = new MailService(
      {
        get: (key: string) => {
          const values: Record<string, string> = {
            APP_URL: "https://madupe.com",
            MAIL_FROM: "Madupe <support@madupe.com>",
            SMTP_HOST: "smtp.example.com",
            SMTP_PORT: "587",
            SMTP_USER: "smtp-user",
            SMTP_PASSWORD: "smtp-password"
          };
          return values[key];
        }
      } as never,
      {
        sendMail: async (message: unknown) => {
          sent.push(message);
          return { messageId: "message-1" };
        }
      }
    );

    await service.sendTemplate({
      template: "password_reset",
      to: "alex@example.com",
      variables: {
        actionUrl: "https://madupe.com/reset?token=abc",
        appName: "Madupe",
        displayName: "Alex"
      }
    });

    assert.equal(sent.length, 1);
    assert.match(JSON.stringify(sent[0]), /Reset your Madupe password/);
    assert.match(JSON.stringify(sent[0]), /alex@example.com/);
  });
});
