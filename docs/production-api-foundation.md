# Production API Foundation

The production foundation keeps business logic in the NestJS API while Supabase provides Auth and Postgres. The API owns venue access checks, QR intake, request lifecycle updates, message encryption, cache invalidation, rate limiting, and background job wiring.

## Authentication

Protected API endpoints use Supabase bearer tokens in production. The `SupabaseAuthGuard` loads the authenticated user, active staff profile, workspace, venue membership, and role before protected handlers run.

Development auth headers may still be used by local-only development paths, but they must not be enabled for public production deployments.

Roles are `owner`, `admin`, `manager`, `staff`, `security`, and `read_only`.

## Public Endpoints

- `GET /public/qr/:token`
- `POST /public/qr/:token/messages`
- `GET /public/qr/:token/conversations/:conversationId`
- `GET /public/qr/venues/:venueSlug`
- `POST /public/qr/venues/:venueSlug/messages`
- `GET /public/qr/venues/:venueSlug/conversations/:conversationId`

Public message endpoints create or resume conversations, store guest messages, triage intent, create support requests when appropriate, store assistant replies, and return guest-visible conversation state. Public conversation reads require the `X-Guest-Session` header instead of a `sessionId` query parameter.

## Protected Endpoints

- `POST /admin/venues`
- `POST /admin/venues/:venueId/service-points`
- `PATCH /admin/venues/:venueId/opening-hours`
- `GET /venues/:venueId/requests`
- `PATCH /requests/:requestId/status`

Protected endpoints enforce workspace and venue access in the NestJS API.

## Deployment Files

- Root env template: `.env.example`
- API image: `apps/api/Dockerfile`
- Docker context exclusions: `.dockerignore`
- CI workflow: `.github/workflows/ci.yml`
- API deployment guide: `docs/deployment/api.md`
- Web deployment guide: `docs/deployment/web.md`

## Production Requirements

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `MESSAGE_ENCRYPTION_KEY`
- `REDIS_URL`
- `CORS_ORIGINS`

Production startup fails fast without `MESSAGE_ENCRYPTION_KEY`, `REDIS_URL`, or `DATABASE_URL`.
