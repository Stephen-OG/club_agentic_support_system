# Hybrid Production MVP Design

## Purpose

This project should evolve from a QR-table support demo into a production-ready, multi-venue guest support platform. The product lets guests scan QR codes at tables or service points, chat naturally with the venue team, and create structured support requests that staff can triage, assign, complete, and resolve.

The first production version should support multiple venues from day one while staying focused on the core operational loop: guest asks, AI triages, staff acts, guest gets updates.

## Architecture

The production app will use a hybrid architecture:

- Supabase provides authentication and hosted Postgres.
- NestJS becomes the main production backend for business logic, role enforcement, workflows, audit logging, and future integrations.
- Prisma becomes the production data model and migration source.
- Next.js remains the frontend for guest chat, staff operations, and admin management.
- The current Next.js API routes should become thin API adapters or be removed once the NestJS API owns the workflows.
- `packages/shared` should hold reusable schemas, request workflow constants, and deterministic priority classification.

This keeps Supabase useful for auth/database while giving the app a clear backend boundary for multi-venue production behavior.

## Roles And Access

The production role model is:

- Admin: workspace-level user who can manage all venues in the workspace.
- Manager: venue-level user who can manage one assigned venue.
- Staff: venue-level user who handles support requests for their venue.
- Guest: public QR user with no login.

Admins can create venues, service points, QR tokens, managers, and staff. Managers can manage only their assigned venue. Staff can see and act on requests only within their assigned venue. Guests can create messages and manage their own request state from the public QR chat.

Permission checks must happen in the NestJS API. The frontend can hide unavailable actions, but it cannot be the source of authority.

## Core Workflows

### Admin Setup

An admin logs in, lands in their workspace, and can create venues, service points, QR tokens, and staff accounts. Seed data can create initial development records, but the app should expose admin screens for production management.

### Venue Management

Admins can switch across all venues in the workspace. Managers see only venues where they have an active manager membership. Each venue owns its service points, staff memberships, conversations, messages, support requests, and audit records.

### Guest Request

A guest opens a public QR URL tied to a service point. The backend resolves the token to an active service point and venue, starts or resumes a conversation, stores the guest message, triages the message, creates or updates a support request, stores the assistant reply, and returns the updated conversation state.

If OpenAI triage fails or is unavailable, deterministic priority rules must still classify urgent and high-priority cases.

### Staff Operations

Dashboard users see requests filtered by their permissions. Admins and managers can assign requests. Staff can accept, decline, move requests in progress, reply to guests, and mark requests complete. All status transitions should be validated by the API.

### Resolution Loop

When staff mark a request complete, the guest chat asks whether the issue is resolved. If the guest confirms, the request becomes resolved. If the guest is not satisfied, the request returns to in progress.

### Audit Trail

Important production actions should create audit or request events:

- venue created
- service point created or disabled
- QR token generated or rotated
- staff account created
- staff role or membership changed
- guest request created
- request assigned
- request status changed
- staff reply sent
- guest cancelled or resolved a request

Audit logging should not block the guest flow if it fails, but failures must be logged for operators.

## Data Model Direction

Production should move toward the richer Prisma model already present in `packages/database/prisma/schema.prisma`:

- `Workspace`: business/account container.
- `Venue`: physical venue under a workspace.
- `VenueLocation`: zone or area inside a venue.
- `ServicePoint`: table, booth, bar spot, VIP area, or other QR-linked location.
- `StaffProfile`: person identity details.
- `StaffMembership`: role and access relationship between staff, workspace, and venue.
- `Conversation`: guest chat session for a service point.
- `Message`: guest, assistant, staff, or system message.
- `SupportRequest`: structured operational request created from chat.
- `RequestAssignment`: assignment history for staff.
- `RequestEvent`: support request lifecycle event.
- `AuditLog`: admin, manager, and staff operational audit record.
- `AiTriageLog`: triage input/output metadata for debugging and safety.

The simpler Supabase `clubs/club_tables` schema can remain temporarily for demo/reference, but production implementation should not maintain two incompatible database models. New production work should target Prisma migrations and the workspace/venue/service-point model.

## Production UI Scope

The first production UI should include:

- Login through Supabase auth.
- Workspace and venue context.
- Admin screens for venues, service points, QR tokens, staff, and role assignments.
- Operations dashboard with request list, filters, assignment controls, conversation view, staff replies, and lifecycle actions.
- Public guest chat tied to a service point QR token.
- Basic venue settings for name, locations/zones, and active or inactive service points.

Billing, POS integrations, webhook management, and advanced analytics are out of scope for this first production build. The schema can keep supporting those future directions, but the first milestone should ship the core venue support workflow.

## Error Handling And Safety

The production app should handle expected failures explicitly:

- Invalid or inactive QR token shows a friendly unavailable state.
- Guest message failure preserves the typed message and lets the guest retry.
- AI failure falls back to deterministic triage.
- Permission failure returns `403` from the API and shows a clear UI state.
- Invalid status transition returns a conflict response instead of silently changing state.
- Assignment conflicts are rejected by the API.
- Missing venue or staff membership shows a setup-required state.
- Audit logging failure is logged but does not block the guest flow.

Safety-sensitive terms such as medical, allergy, choking, injury, assault, fire, smoke, danger, security, or emergency must classify as urgent even if AI triage is unavailable.

## Testing Strategy

The first production test coverage should focus on behavior that protects the operational workflow:

- Shared deterministic priority classifier tests.
- Request status transition tests.
- Role and permission tests for admin, manager, staff, and guest flows.
- QR guest-message API tests.
- Staff assignment and lifecycle action tests.
- Audit/request event creation tests.
- Basic Next.js UI smoke tests for guest chat and operations dashboard.

Tests should be added as each workflow moves from demo code to the NestJS/Prisma production path.

## First Milestone Definition

The first production milestone is complete when:

- An admin can log in and manage multiple venues in one workspace.
- A manager can log in and manage only their assigned venue.
- Admins can create venues, service points, QR tokens, and staff memberships.
- Guests can scan a service point QR token and create a support request without logging in.
- AI or deterministic triage creates a prioritized request.
- Staff can operate the request lifecycle from a venue-scoped dashboard.
- Guests receive status updates and can confirm resolution.
- Core actions create request events or audit logs.
- The app uses the Prisma production model for new production workflows.

