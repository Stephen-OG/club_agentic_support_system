import { Inject, Injectable, InternalServerErrorException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { type EmailTemplateKey, renderEmailTemplate } from "./email-templates";

type MailTransport = {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
};

export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

type MailConfig = Pick<ConfigService, "get">;

export function buildSmtpOptions(config: MailConfig): SMTPTransport.Options {
  const host = config.get<string>("SMTP_HOST") || "smtp.gmail.com";
  const port = Number(config.get<string>("SMTP_PORT") || "465");
  const timeout = Number(config.get<string>("SMTP_TIMEOUT_MS") || "8000");
  const rejectUnauthorized =
    config.get<string>("SMTP_TLS_REJECT_UNAUTHORIZED") ?? config.get<string>("SMTP_TLS_REJECT_UNAUTHORISED");

  const user = config.get<string>("SMTP_USER");
  const pass = config.get<string>("SMTP_PASSWORD");

  return {
    host,
    port,
    secure: config.get<string>("SMTP_SECURE") === "true" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    tls: rejectUnauthorized === "false" ? { rejectUnauthorized: false } : undefined
  };
}

@Injectable()
export class MailService {
  private transport: MailTransport | null;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(MAIL_TRANSPORT)
    transport?: MailTransport
  ) {
    this.transport = transport ?? null;
  }

  async sendTemplate(input: {
    template: EmailTemplateKey;
    to: string;
    variables: {
      actionUrl: string;
      appName: string;
      displayName: string;
      temporaryPassword?: string;
    };
  }) {
    const from = this.config.get<string>("MAIL_FROM") || this.config.get<string>("SMTP_FROM");

    if (!from) {
      throw new InternalServerErrorException("MAIL_FROM is required to send email");
    }

    const rendered = renderEmailTemplate(input.template, input.variables);

    try {
      await this.getTransport().sendMail({
        from,
        to: input.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
    } catch {
      throw new ServiceUnavailableException("Email delivery failed. Please try again shortly.");
    }
  }

  private getSmtpOptions(): SMTPTransport.Options {
    return buildSmtpOptions(this.config);
  }

  private getTransport() {
    this.transport ??= nodemailer.createTransport(this.getSmtpOptions());
    return this.transport;
  }
}
