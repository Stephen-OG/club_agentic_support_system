# Production API Foundation

The production foundation moves business logic into the NestJS API while Supabase remains the auth and Postgres provider.

## Development Auth Headers

Until Supabase JWT verification is wired, protected API endpoints use development headers:

- `x-staff-id`
- `x-workspace-id`
- `x-venue-id`
- `x-staff-role`

Roles must be one of `owner`, `admin`, `manager`, `staff`, `security`, or `read_only`.

## Public Endpoints

- `POST /public/qr/:token/messages`

Creates or resumes a service-point conversation, stores the guest message, triages it, creates a support request, stores the assistant reply, and returns the conversation state.

## Protected Endpoints

- `POST /admin/venues`
- `POST /admin/venues/:venueId/service-points`
- `GET /venues/:venueId/requests`
- `PATCH /requests/:requestId/status`

Protected endpoints enforce workspace and venue access in the NestJS API.
