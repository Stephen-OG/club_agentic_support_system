# Web Deployment

The Madupe web app is a Next.js app in `apps/web`. Vercel is the simplest target for the MVP because it handles Next.js routing, static assets, and server rendering with very little infrastructure.

## Recommended Vercel Settings

- Framework preset: Next.js
- Root directory: repository root
- Build command: `npm run build -w @madupe/web`
- Install command: `npm ci`
- Output: Next.js default

## Required Environment

Set these values in the web hosting project:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_URL=https://madupe.com`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOG_LEVEL`

Only `NEXT_PUBLIC_*` values are exposed to the browser. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only; it is used by server components and API-adjacent web code and must never be sent to client components.

`NEXT_PUBLIC_APP_URL` is the canonical guest-facing base URL used for generated QR codes and venue links. Set it to the production domain so QR codes encode `https://madupe.com/qr/:token` even if an admin opens the command center from a Vercel preview URL.

## Supabase Auth Email Templates

Install the Madupe templates from `supabase/email-templates` before production signup tests:

- Supabase Auth Site URL: `https://madupe.com`
- Supabase Auth redirect allow list: include `https://madupe.com/signup`, `https://madupe.com/login`, and any intentional preview URLs.
- Confirm sign up subject: `Confirm your Madupe account`
- Magic Link / OTP subject: `Your Madupe sign-in link`
- Reset password subject: `Reset your Madupe password`
- Invite user subject: `You have been invited to Madupe`
- Change email address subject: `Confirm your new Madupe email address`
- Reauthentication subject: `Your Madupe verification code`

Keep Supabase template variables such as `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`, `{{ .Email }}`, and `{{ .NewEmail }}` unchanged when copying the templates.

## Pre-Deploy Checks

```bash
npm ci
npm test --workspaces --if-present
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
```

## Runtime Checks

After deployment:

1. Open `/login` and confirm the page renders without loading-shell stalls.
2. Sign in with a verified user and confirm `/me` returns the expected role.
3. Open `/admin` as owner/admin/manager and confirm venue controls are clickable.
4. Open `/staff` as staff/security/read-only and confirm the queue loads.
5. Scan or open one `/qr/:token` and one `/venue/:slug` link and confirm guest chat loads without `sessionId` in the URL.

## CORS

The API must allow the deployed web origin through `CORS_ORIGINS`, for example:

```bash
CORS_ORIGINS=https://madupe.com
```

Use comma-separated origins only when you intentionally support multiple environments.
