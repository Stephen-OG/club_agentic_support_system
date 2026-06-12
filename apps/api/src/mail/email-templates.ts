export type EmailTemplateKey = "email_verification" | "password_reset" | "staff_invitation";

type TemplateVariables = {
  actionUrl?: string;
  appName: string;
  displayName: string;
  temporaryPassword?: string;
  verificationCode?: string;
};

type EmailTemplateDefinition = {
  key: EmailTemplateKey;
  name: string;
  subject: (variables: TemplateVariables) => string;
  preheader: string;
  body: (variables: TemplateVariables) => string[];
  ctaLabel: string;
};

export const emailTemplateDefinitions: EmailTemplateDefinition[] = [
  {
    key: "email_verification",
    name: "Email Verification",
    subject: ({ appName }) => `Verify your ${appName} email`,
    preheader: "Use this one-time code to finish setting up your workspace.",
    ctaLabel: "Verification code",
    body: ({ appName, displayName, verificationCode }) => [
      `Hi ${displayName},`,
      `Enter this code to finish creating your ${appName} account: ${verificationCode || "your verification code"}`,
      "This code expires soon. If you did not create an account, you can ignore this email."
    ]
  },
  {
    key: "password_reset",
    name: "Password Reset",
    subject: ({ appName }) => `Reset your ${appName} password`,
    preheader: "Use this one-time code to set a new password.",
    ctaLabel: "Reset code",
    body: ({ displayName, verificationCode }) => [
      `Hi ${displayName},`,
      "We received a request to reset your password.",
      `Enter this code to choose a new password: ${verificationCode || "your reset code"}`,
      "If you did not request this, you can ignore this email."
    ]
  },
  {
    key: "staff_invitation",
    name: "Staff Invitation",
    subject: ({ appName }) => `You have been invited to ${appName}`,
    preheader: "Your team account is ready. Sign in and set a new password.",
    ctaLabel: "Open command center",
    body: ({ appName, displayName, temporaryPassword }) => [
      `Hi ${displayName},`,
      `Your ${appName} staff account is ready.`,
      `Temporary password: ${temporaryPassword || "provided by your manager"}`,
      "You will be asked to set a new password after signing in."
    ]
  }
];

export function renderEmailTemplate(key: EmailTemplateKey, variables: TemplateVariables) {
  const template = emailTemplateDefinitions.find((item) => item.key === key);

  if (!template) {
    throw new Error(`Unknown email template: ${key}`);
  }

  const actionLine = variables.actionUrl ? [`${template.ctaLabel}: ${variables.actionUrl}`] : [];
  const textLines = [
    template.preheader,
    "",
    ...template.body(variables),
    "",
    ...actionLine
  ];

  const paragraphs = template
    .body(variables)
    .map((line) => `<p style="margin:0 0 16px;color:#263631;line-height:1.5;">${escapeHtml(line)}</p>`)
    .join("");

  return {
    subject: template.subject(variables),
    text: textLines.join("\n"),
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#263631;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5e1;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 8px;color:#5b7068;font-size:13px;">${escapeHtml(template.name)}</p>
                <h1 style="margin:0;color:#10211b;font-size:24px;">${escapeHtml(template.subject(variables))}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px;">
                ${paragraphs}
                ${variables.actionUrl ? `<p style="margin:24px 0;">
                  <a href="${escapeAttribute(variables.actionUrl)}" style="display:inline-block;background:#153f34;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">${escapeHtml(template.ctaLabel)}</a>
                </p>
                <p style="margin:16px 0 0;color:#5b7068;font-size:13px;line-height:1.5;">If the button does not work, paste this link into your browser:<br>${escapeHtml(variables.actionUrl)}</p>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
