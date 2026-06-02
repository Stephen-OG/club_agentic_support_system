# API Deployment

The GuestOS API is a NestJS service in `apps/api`. It can run on Fly.io, ECS, Render, Railway, or a self-hosted Docker host. Build the API image from the repository root:

```bash
docker build -f apps/api/Dockerfile -t guestos-api .
```

Run it locally with production-like secrets:

```bash
docker run --rm -p 4000:4000 --env-file .env.prod guestos-api
```

## Required Production Environment

Set these values in the platform secret manager, not in the image:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=4000`
- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_TRIAGE_MODEL`
- `MESSAGE_ENCRYPTION_KEY`
- `REDIS_URL`
- `CORS_ORIGINS`

`MESSAGE_ENCRYPTION_KEY` must decode to 32 bytes. Generate it with:

```bash
openssl rand -base64 32
```

`REDIS_URL` is required in production because rate limits, cache, and background jobs need shared state across API instances.

## Pre-Deploy Checks

Run these before promoting the API:

```bash
npm ci
npm test --workspaces --if-present
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
npm run prisma:generate -w @guestos/database
```

Run migrations against the target database before switching traffic:

```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

For managed production databases, prefer the provider's migration job or release phase instead of running migrations from every API instance. Do not use `prisma migrate dev` against production.

## Supabase/Postgres Pooling

Render can run more than one API process during deploys or scaling, and Prisma opens a pool per process. If Supabase reports `EMAXCONNSESSION` or `max clients reached in session mode`, cap the Prisma pool in `DATABASE_URL`.

For a small MVP deployment, start with:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?connection_limit=3&pool_timeout=30"
```

If you run multiple API instances, multiply `connection_limit` by the instance count and keep it below the Supabase pool size. If the database is already at its limit, lower the instance count first, then increase the Supabase pool size only after confirming the app is stable.

## Health And Rollback

- Health checks should call `GET /health`.
- Keep one previous image available for rollback.
- If startup fails with `MESSAGE_ENCRYPTION_KEY`, `REDIS_URL`, or `DATABASE_URL`, fix secrets before retrying. The API intentionally fails fast instead of starting in an unsafe mode.
- If a Prisma migration fails, stop deployment and follow [DB Migration Rollback](../runbooks/db-migration-rollback.md).
