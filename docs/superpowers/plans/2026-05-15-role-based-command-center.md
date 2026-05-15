# Role-Based Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the command center into admin/manager operations surfaces and a focused staff dashboard while preserving Supabase Auth and Nest API integration.

**Architecture:** Add a small role-policy helper that converts `/me` membership data into allowed navigation and default dashboard mode. The app shell fetches `/me` once after login, gates navigation by role, and renders either the existing command center views or a new staff-focused queue.

**Tech Stack:** Next.js App Router, React client components, Supabase browser client, Nest API, TypeScript, Node test runner for pure role policy tests.

---

### Task 1: Role Policy Helper

**Files:**
- Create: `apps/web/lib/auth/role-policy.ts`
- Create: `apps/web/lib/auth/role-policy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/auth/role-policy.test.ts` with tests for admin, manager, staff, security, and read-only navigation.

- [ ] **Step 2: Run the type check to verify the helper is missing**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: FAIL because `./role-policy` does not exist.

- [ ] **Step 3: Implement the role policy**

Create `apps/web/lib/auth/role-policy.ts` with exported `commandViews`, `getPrimaryMembership`, `getRoleDashboardMode`, and `getVisibleCommandViews`.

- [ ] **Step 4: Run the type check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: PASS.

### Task 2: Role-Aware Shell

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/app-shell.tsx`

- [ ] **Step 1: Fetch `/me` after login**

Use `apiRequest<CommandUser>(supabase, "/me")` in `page.tsx`; show a clear error if the API rejects the session.

- [ ] **Step 2: Pass `currentUser` into `AppShell`**

Change `AppShell` props to receive `currentUser: CommandUser`.

- [ ] **Step 3: Gate navigation by role**

Use `getVisibleCommandViews(currentUser)` to render only allowed nav items. Admin/owner see all views. Manager sees dashboard, operations, venues, and account. Staff/security/read-only see staff dashboard and account.

### Task 3: Staff Dashboard

**Files:**
- Create: `apps/web/app/components/staff-dashboard.tsx`
- Modify: `apps/web/app/app-shell.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Create focused staff queue**

Build `StaffDashboard` to use the user’s primary membership venue and call `/venues/:venueId/requests`.

- [ ] **Step 2: Add staff-safe actions**

Show allowed quick transitions for staff/security: acknowledged/assigned to in progress, and in progress to completed.

- [ ] **Step 3: Add role-aware empty states**

If the user has no venue membership, show a clear “no assigned venue” state instead of calling the API.

### Task 4: Verification and Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run checks**

Run:
`npm run lint -w @guestos/web`
`npx tsc --noEmit -p apps/web/tsconfig.json`
`npm run build -w @guestos/web`

- [ ] **Step 2: Restore `next-env.d.ts` if Next rewrites it**

Ensure `apps/web/next-env.d.ts` keeps `./.next/dev/types/routes.d.ts` before committing.

- [ ] **Step 3: Commit**

Commit the implementation with `feat: add role based command center`.
