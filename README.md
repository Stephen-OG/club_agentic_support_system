# Madupe Agentic Support System

This project is an MVP for QR-based venue support. Guests scan either a venue QR code or a service-point QR code, describe what they need, and get a conversational response while the request is turned into an operations task for staff.

The app classifies each guest message, creates a support request, keeps the conversation open, and lets the operations team acknowledge, assign, progress, complete, cancel, or resolve the request from a dashboard.

## Intention

The purpose of this project is to explore a lightweight guest-to-staff workflow:

- A venue has a public QR intake at `/venue/:slug`.
- Each service point, including VIP tables or booths, has a public QR intake at `/qr/:token`.
- A guest sends a message such as needing service, cleaning, payment help, lost property, or urgent support.
- The assistant replies politely and creates a structured request for staff with priority, location, and agent metadata.
- Staff see live requests in an admin dashboard with venue, service point, location, category, priority, status, and conversation history.
- Managers or admins can assign requests to staff.
- Staff can accept, decline, move requests in progress, and mark them complete.
- Guests see status updates in the chat, can cancel a request, and can confirm whether a completed request was actually resolved.

The main goal was not just chat, but a simple operational loop: guest asks, AI triages, staff acts, guest gets updates.

## Product Shape

Admins manage venues, staff credentials, and QR service points from `/admin`.

The guest side has two public entry points:

- `/venue/:slug` for a venue-wide QR code that asks the guest where they are.
- `/qr/:token` for a specific service point such as a VIP booth, bar area, table, or room.

Staff users can work their assigned venue queue from `/staff`.

## What This App Proves

This project proves that a venue can replace scattered verbal support requests with a structured queue that is easier for staff to manage. It also shows how AI can be used in a narrow, practical way: understand a guest's message, create the right staff task, keep the guest updated, and escalate urgent situations clearly.

## Tech Context

This is a TypeScript monorepo with:

- A Next.js web app in `apps/web`
- A NestJS API skeleton in `apps/api`
- Shared request classification and schemas in `packages/shared`
- Database/Prisma setup in `packages/database`
- Supabase migrations in `supabase`

The backend uses Prisma models for workspaces, venues, service points, conversations, messages, staff, memberships, and support requests. Legacy club/table Supabase SQL has been removed from the active implementation.

## Useful Mental Model

Think of this project as a hospitality support queue powered by QR chat:

`Venue/service-point QR -> guest chat -> AI triage -> support request -> staff dashboard -> guest-visible status updates -> resolution`

## Deployment And Operations

- Environment template: `.env.example`
- API deployment guide: `docs/deployment/api.md`
- Web deployment guide: `docs/deployment/web.md`
- Security checklist: `docs/security/mvp-security-and-compliance.md`
- Runbooks: `docs/runbooks/`
