# Madupe Supabase Auth Email Templates

Use these templates in Supabase Dashboard under Authentication > Emails > Templates, or apply equivalent HTML through the Supabase Management API.

Set the Supabase Auth Site URL to the production app origin, for example `https://madupe.com`, and add all required redirect URLs for production and preview environments.

## Template Mapping

| Supabase template | Subject | File |
| --- | --- | --- |
| Confirm sign up | Confirm your Madupe account | `confirmation.html` |
| Magic Link / OTP | Your Madupe sign-in link | `magic-link.html` |
| Reset password | Reset your Madupe password | `recovery.html` |
| Invite user | You have been invited to Madupe | `invite.html` |
| Change email address | Confirm your new Madupe email address | `email-change.html` |
| Reauthentication | Your Madupe verification code | `reauthentication.html` |

## Variables

These templates intentionally preserve Supabase variables such as `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`, `{{ .Email }}`, and `{{ .NewEmail }}`. Do not escape or rename them when pasting into Supabase.

If an external SMTP provider enables link tracking, disable tracking for auth emails so confirmation links are not rewritten.
