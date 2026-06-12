# API Deployment

The Madupe API is a NestJS service in `apps/api`. It can run on Fly.io, ECS, Render, Railway, or a self-hosted Docker host. Build the API image from the repository root:

```bash
docker build -f apps/api/Dockerfile -t madupe-api .
```

Run it locally with production-like secrets:

```bash
docker run --rm -p 4000:4000 --env-file .env.prod madupe-api
```

## Required Production Environment

Set these values in the platform secret manager, not in the image:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=4000`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_TRIAGE_MODEL`
- `MESSAGE_ENCRYPTION_KEY`
- `AUTH_JWT_SECRET`
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_SECURE=true`
- `SMTP_TIMEOUT_MS=8000`
- `SMTP_TLS_REJECT_UNAUTHORIZED=true`
- `MAIL_FROM`
- `NEXT_PUBLIC_APP_URL` (or `APP_URL`)
- `PUBLIC_API_URL` (or `NEXT_PUBLIC_API_URL`)
- `REDIS_URL`
- `CORS_ORIGINS`

`MESSAGE_ENCRYPTION_KEY` must decode to 32 bytes. Generate it with:

```bash
openssl rand -base64 32
```

`AUTH_JWT_SECRET` signs short-lived staff/admin access tokens. Generate it with:

```bash
openssl rand -base64 48
```

`REDIS_URL` is required in production because rate limits, cache, and background jobs need shared state across API instances.

`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and `SMTP_SECURE=true` use Gmail/Google Workspace SMTP over SSL. `SMTP_USER` should be the full Google Workspace/Gmail sender address, and `SMTP_PASSWORD` should be an app password for that account. `MAIL_FROM` should be a branded sender such as `Madupe <support@madupe.com>`. `SMTP_TIMEOUT_MS` keeps signup, verification-code, and password-reset requests from hanging on a bad SMTP connection. Keep `SMTP_TLS_REJECT_UNAUTHORIZED=true` in production so SMTP certificates are verified; set it to `false` only as an explicit local or emergency provider workaround while you investigate the certificate chain. `NEXT_PUBLIC_APP_URL` or `APP_URL` is used for password reset and staff invitation links. In production, public URLs must be public HTTPS origins, never localhost.

## Transactional Email Templates

The API owns transactional email rendering in `apps/api/src/mail/email-templates.ts`.

- `email_verification`: sends a one-time code to confirm a new account email before workspace setup.
- `password_reset`: sends a secure password reset link.
- `staff_invitation`: sends staff their command-center invite and temporary credential.

## Pre-Deploy Checks

Run these before promoting the API:

```bash
npm ci
npm test --workspaces --if-present
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
npm run prisma:generate -w @madupe/database
```

Run migrations against the target database before switching traffic:

```bash
npm run prisma:migrate:deploy -w @madupe/database
```

This repo keeps production SQL migrations in `packages/database/prisma/migrations`. Prisma owns the application schema and generated client.

For a fresh local or shared development database during the first-party auth transition, sync the full Prisma schema before starting the API:

```bash
npm run prisma:push
```

Use `prisma:push` only as the transitional schema-sync command for development databases. Deployed environments should use `prisma:migrate:deploy` once a full production baseline migration exists for the current schema.

## Postgres Pooling

Render can run more than one API process during deploys or scaling, and Prisma opens a pool per process. If Postgres reports max connection errors, cap the Prisma pool in `DATABASE_URL`.

For a small MVP deployment, start with:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?connection_limit=3&pool_timeout=30"
```

If you run multiple API instances, multiply `connection_limit` by the instance count and keep it below the database pool size. If the database is already at its limit, lower the instance count first, then increase the pool size only after confirming the app is stable.

## Health And Rollback

- Health checks should call `GET /health`.
- Keep one previous image available for rollback.
- If startup fails with `MESSAGE_ENCRYPTION_KEY`, `AUTH_JWT_SECRET`, `REDIS_URL`, or `DATABASE_URL`, fix secrets before retrying. The API intentionally fails fast instead of starting in an unsafe mode.
- If a Prisma migration fails, stop deployment and follow [DB Migration Rollback](../runbooks/db-migration-rollback.md).
