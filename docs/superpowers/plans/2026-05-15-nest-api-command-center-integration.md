# Nest API Command Center Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Command Center staff, venue, operations, and QR chat surfaces to the current Nest/Prisma API instead of legacy Next/Supabase demo routes.

**Architecture:** Protected staff/admin browser flows use Supabase Auth in the web app and send Bearer tokens to Nest. Public QR guest flows call unauthenticated Nest public endpoints. Legacy Next admin routes remain present but are not used by the Command Center.

**Tech Stack:** TypeScript, NestJS, Prisma, Supabase Auth, Next.js App Router, React, Node test runner.

---

### Task 1: Protect And Extend Nest Venue/Request APIs

**Files:**
- Modify: `apps/api/src/requests/requests.controller.ts`
- Modify: `apps/api/src/service-points/admin-venues.controller.ts`
- Modify: `apps/api/src/service-points/service-points.service.ts`
- Test: `apps/api/src/service-points/admin-service-points.service.test.ts`
- Test: `apps/api/src/service-points/service-points.service.test.ts`

- [ ] Add failing service tests for listing workspace venues and loading a public QR conversation by token/conversation id.
- [ ] Implement `ServicePointsService.listVenues(auth)` and `ServicePointsService.getGuestConversation(token, conversationId)`.
- [ ] Add `GET /admin/venues` and `GET /public/qr/:token/conversations/:conversationId`.
- [ ] Switch protected request and venue controllers from `DevAuthGuard` to `SupabaseAuthGuard`.
- [ ] Run `npm test -w @guestos/api` and `npm run build -w @guestos/api`.
- [ ] Commit as `feat: expose nest command center api`.

### Task 2: Add Typed Web API Adapters

**Files:**
- Modify: `apps/web/lib/auth/types.ts`
- Modify: `apps/web/lib/api/client.ts`
- Test: `apps/web/lib/api/client.test.ts`

- [ ] Add typed response shapes for team, venues, service points, requests, messages, and public QR responses.
- [ ] Add `publicApiRequest()` for unauthenticated Nest public endpoints.
- [ ] Add tests for public API network errors and protected API errors.
- [ ] Run the targeted web API tests.
- [ ] Commit as `feat: add command center api client types`.

### Task 3: Wire Command Center Screens To Live API

**Files:**
- Modify: `apps/web/app/components/team-command.tsx`
- Modify: `apps/web/app/components/venues-command.tsx`
- Modify: `apps/web/app/components/operations-command.tsx`
- Modify: `apps/web/app/components/command-center-dashboard.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] Update Team to load `/team`, render existing users, and use live venues for venue-scoped roles.
- [ ] Update Venues to load `/admin/venues` and show service-point tokens.
- [ ] Update Operations to load the current user's first venue and `/venues/:venueId/requests`, with status controls.
- [ ] Update Dashboard metrics from live team/venue/request state.
- [ ] Run `npm run lint -w @guestos/web` and `npm run build -w @guestos/web`.
- [ ] Commit as `feat: wire command center to nest api`.

### Task 4: Migrate Public QR Chat To Nest Public API

**Files:**
- Modify: `apps/web/app/table/[token]/table-chat.tsx`
- Modify: `apps/web/lib/types.ts`

- [ ] Replace `/api/chat` POST with `POST /public/qr/:token/messages`.
- [ ] Replace `/api/chat` GET polling with `GET /public/qr/:token/conversations/:conversationId`.
- [ ] Replace `/api/chat` PATCH with `PATCH /public/requests/:requestId/action`.
- [ ] Normalize Prisma-shaped messages/requests for the existing chat UI.
- [ ] Run `npm run lint -w @guestos/web` and `npm run build -w @guestos/web`.
- [ ] Commit as `feat: route guest chat through nest api`.

### Task 5: Final Verification

**Files:**
- No production file changes expected.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --audit-level=high`.
- [ ] Check `git status --short --branch`.
