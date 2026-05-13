# Agentic Support System

This project is an MVP for a QR-based support system for clubs, bars, lounges, or similar venues. The idea is that a guest scans a table QR code, opens a chat tied to that table, and asks naturally for help instead of waiting to catch a staff member's attention.

The app turns the guest message into a staff-facing support request. It classifies the request, gives it a priority, keeps the conversation open, and lets the operations team assign, accept, decline, complete, cancel, or resolve the request from a dashboard.

## Intention

The purpose of this project was to explore a lightweight "guest-to-staff" workflow:

- A table has a QR token and a public chat page.
- A guest sends a message such as needing spoons, tissues, cleaning, payment help, or urgent support.
- The assistant replies politely and creates a structured request for staff.
- Staff see live requests in an admin dashboard with table, zone, category, priority, status, and conversation history.
- Managers or admins can assign requests to staff.
- Staff can accept, decline, move requests in progress, and mark them complete.
- Guests can cancel a request or confirm whether a completed request was actually resolved.

The main goal was not just chat, but a simple operational loop: guest asks, AI triages, staff acts, guest gets updates.

## Product Shape

The first screen introduces the "Club Support System" and links to a demo table chat and the staff dashboard.

The guest side lives at table URLs like `/table/demo-table-1`. In a real venue, those URLs would be printed as QR codes for each physical table.

The staff side lives at `/admin`. It is designed as an operations dashboard for tracking active requests, assigning staff, replying to guests, and testing roles such as manager, admin, and staff.

## What This App Proves

This project proves that a venue can replace scattered verbal support requests with a structured queue that is easier for staff to manage. It also shows how AI can be used in a narrow, practical way: not to fully automate hospitality, but to understand a guest's message, create the right staff task, and escalate urgent situations more clearly.

## Tech Context

This is a TypeScript monorepo with:

- A Next.js web app in `apps/web`
- A NestJS API skeleton in `apps/api`
- Shared request classification and schemas in `packages/shared`
- Database/Prisma setup in `packages/database`
- Supabase schema, seed data, and migrations in `supabase`

The web app can run in demo mode without Supabase by using an in-memory demo store. When Supabase credentials are available, the chat and dashboard routes persist conversations, messages, staff, tables, and support requests.

## Useful Mental Model

Think of this project as a hospitality support queue powered by table-level chat:

`QR code -> guest chat -> AI triage -> support request -> staff dashboard -> resolution`

