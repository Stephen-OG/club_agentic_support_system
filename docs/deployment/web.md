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
- `LOG_LEVEL`

Only `NEXT_PUBLIC_*` values are exposed to the browser. Authentication requests go through the Nest API and use app-issued bearer tokens stored by the web client.

`NEXT_PUBLIC_APP_URL` is the canonical guest-facing base URL used for generated QR codes and venue links. Set it to the production domain so QR codes encode `https://madupe.com/qr/:token` even if an admin opens the command center from a Vercel preview URL.

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
2. Create an account and confirm the verification email arrives before signing in.
3. Sign in with a verified user and confirm `/me` returns the expected role.
4. Open `/admin` as owner/admin/manager and confirm venue controls are clickable.
5. Open `/staff` as staff/security/read-only and confirm the queue loads.
6. Scan or open one `/qr/:token` and one `/venue/:slug` link and confirm guest chat loads without `sessionId` in the URL.

## CORS

The API must allow the deployed web origin through `CORS_ORIGINS`, for example:

```bash
CORS_ORIGINS=https://madupe.com
```

Use comma-separated origins only when you intentionally support multiple environments.
