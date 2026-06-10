import { Injectable, InternalServerErrorException } from "@nestjs/common";
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

@Injectable()
export class MailService {
  private transport: MailTransport | null;

  constructor(
    private readonly config: ConfigService,
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

    await this.getTransport().sendMail({
      from,
      to: input.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    });
  }

  private getSmtpOptions(): SMTPTransport.Options {
    const host = this.config.get<string>("SMTP_HOST") || "smtp.gmail.com";
    const port = Number(this.config.get<string>("SMTP_PORT") || "587");

    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASSWORD");

    return {
      host,
      port,
      secure: this.config.get<string>("SMTP_SECURE") === "true" || port === 465,
      auth: user && pass ? { user, pass } : undefined
    };
  }

  private getTransport() {
    this.transport ??= nodemailer.createTransport(this.getSmtpOptions());
    return this.transport;
  }
}
