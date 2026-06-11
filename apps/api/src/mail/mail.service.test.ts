import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { buildSmtpOptions, MailService } from "./mail.service";

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

  it("builds Google SSL SMTP options with bounded network timeouts", () => {
    const options = buildSmtpOptions({
      get: (key: string) => {
        const values: Record<string, string> = {
          SMTP_HOST: "smtp.gmail.com",
          SMTP_PORT: "465",
          SMTP_SECURE: "true",
          SMTP_TIMEOUT_MS: "8000",
          SMTP_USER: "support@madupe.com",
          SMTP_PASSWORD: "google-app-password"
        };
        return values[key];
      }
    } as never);

    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.connectionTimeout, 8000);
    assert.equal(options.greetingTimeout, 8000);
    assert.equal(options.socketTimeout, 8000);
    assert.deepEqual(options.auth, { user: "support@madupe.com", pass: "google-app-password" });
  });

  it("can disable SMTP TLS certificate verification from env", () => {
    const options = buildSmtpOptions({
      get: (key: string) => {
        const values: Record<string, string> = {
          SMTP_TLS_REJECT_UNAUTHORIZED: "false"
        };
        return values[key];
      }
    } as never);

    assert.deepEqual(options.tls, { rejectUnauthorized: false });
  });

  it("returns a controlled service unavailable error when SMTP delivery fails", async () => {
    const service = new MailService(
      {
        get: (key: string) => {
          const values: Record<string, string> = {
            MAIL_FROM: "Madupe <support@madupe.com>"
          };
          return values[key];
        }
      } as never,
      {
        sendMail: async () => {
          throw Object.assign(new Error("Greeting never received"), { code: "ETIMEDOUT" });
        }
      }
    );

    await assert.rejects(
      () =>
        service.sendTemplate({
          template: "email_verification",
          to: "alex@example.com",
          variables: {
            actionUrl: "https://madupe.com/verify?token=abc",
            appName: "Madupe",
            displayName: "Alex"
          }
        }),
      ServiceUnavailableException
    );
  });
});
