# Modern QR Operations Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy club/table code, rename service-point QR URLs away from `/table/:token`, and make guest chats receive status updates when staff/admins acknowledge or progress requests.

**Architecture:** Keep the current Prisma-backed `Workspace -> Venue -> ServicePoint -> Conversation -> SupportRequest` model as the only active model. Public venue QR remains `/venue/:slug`; service-point and VIP QR become `/qr/:token`. Staff/admin status transitions append guest-visible conversation messages so polling clients see acknowledgement and progress.

**Tech Stack:** Next.js app router, NestJS API, Prisma/Postgres, node:test, TypeScript.

---

### Task 1: Status Update Messages

**Files:**
- Modify: `apps/api/src/requests/requests.service.ts`
- Modify: `apps/api/src/requests/requests.service.test.ts`

- [ ] Add a failing test that `updateStatus()` creates a `Message` for guest-visible statuses.
- [ ] Implement a status-to-message helper for `acknowledged`, `in_progress`, `completed`, `resolved`, `cancelled`, `declined`, and `escalated`.
- [ ] In the `updateStatus()` transaction, create a `SYSTEM` message tied to the request conversation when a helper message exists.
- [ ] Include recent messages in the update response or rely on polling; do not invent a second response shape.

### Task 2: Modern Service-Point QR Route

**Files:**
- Create: `apps/web/app/qr/[token]/page.tsx`
- Create: `apps/web/app/qr/[token]/qr-chat.tsx`
- Delete: `apps/web/app/table/[token]/page.tsx`
- Delete: `apps/web/app/table/[token]/table-chat.tsx`
- Modify: `apps/web/app/components/venues-command.tsx`

- [ ] Move service-point chat UI from `/table/:token` to `/qr/:token`.
- [ ] Rename local storage keys from `table-chat:*` to `qr-chat:*`.
- [ ] Replace table copy with service-point/VIP-neutral copy.
- [ ] Generate QR URLs as `/qr/${point.qrToken}`.
- [ ] Keep guest request actions and polling.

### Task 3: Venue QR Refresh

**Files:**
- Modify: `apps/api/src/service-points/public-qr.controller.ts`
- Modify: `apps/api/src/service-points/service-points.service.ts`
- Modify: `apps/api/src/service-points/service-points.service.test.ts`
- Modify: `apps/web/app/venue/[slug]/venue-support-chat.tsx`

- [ ] Add `GET /public/qr/venues/:venueSlug/conversations/:conversationId`.
- [ ] Add service method to load venue QR conversation state scoped to the venue support service point.
- [ ] Add tests for the venue conversation loader.
- [ ] Poll venue chat every 3 seconds like service-point QR chat.

### Task 4: Remove Legacy Club/Table Code

**Files:**
- Delete: `apps/web/lib/types.ts`
- Delete: `apps/web/lib/table-display.ts`
- Delete: `apps/web/lib/table-display.test.ts`
- Delete: `apps/web/lib/ai/triage.ts`
- Delete: `supabase/schema.sql`
- Delete: `supabase/seed.sql`
- Delete: `supabase/migrations/20260507011500_add_missing_demo_tables.sql`
- Delete: `supabase/migrations/20260507023000_seed_staff_profiles.sql`
- Modify: `README.md`
- Modify: `supabase/migrations/20260520120000_venue_intake_agent_metadata.sql`
- Create: `supabase/migrations/20260522190000_drop_legacy_club_tables.sql`

- [ ] Remove old frontend type adapters and demo table alias helpers.
- [ ] Remove legacy Supabase schema/seed SQL.
- [ ] Remove snake-case compatibility additions from the current metadata migration.
- [ ] Add an idempotent cleanup migration that drops old `messages`, `support_requests`, `conversations`, `staff_profiles`, `club_tables`, and `clubs` tables if they exist, then drops old enum types if unused.
- [ ] Rewrite README to describe venue/service-point QR flow only.

### Task 5: Verification

**Commands:**
- `npm run test -w @guestos/api`
- `node --test apps/web/lib/*.test.ts apps/web/lib/auth/*.test.ts apps/web/lib/supabase/*.test.ts`
- `npm run lint -w @guestos/web`
- `npm run build -w @guestos/web`
- Prisma smoke checks against live DB:
  - create a test venue
  - create a VIP service point
  - create venue QR guest message
  - create service-point QR guest message
  - move request to `acknowledged` then `in_progress`
  - verify conversation messages contain the guest-visible status updates
