# Command Center SaaS Auth Design

## Purpose

The app should move from a polished demo into a production SaaS command center for venue support operations. The first vertical slice replaces the public marketing-style home page with a real authenticated platform entry, adds Supabase Auth login, supports admin-created staff credentials, requires users to change temporary passwords, and wraps the existing operations workflow in a production-grade Command Center UI.

The first customer owner or admin is seeded manually by us. After that, workspace admins create user credentials inside the app.

## Product Direction

The UI direction is **Command Center**: dark, high-contrast, operational, dense, and premium. It should feel like a live venue control room, not a generic SaaS template. The visual system should use restrained dark surfaces, crisp dividers, compact information density, bright status accents, and clear role-aware controls.

The root route `/` becomes the product entry:

- Signed-out users see the login page.
- Signed-in users with a temporary password flag must change password before accessing the app.
- Signed-in users with valid credentials enter the authenticated command center.

The existing public guest QR experience remains available at service-point/table URLs, but the main root experience is no longer a marketing page.

## Roles And Access

Production roles remain:

- Owner/admin: workspace-wide control over venues, staff, service points, and operations.
- Manager: venue-scoped management for assigned venues.
- Staff: venue-scoped request handling.
- Guest: public QR user with no login.

Permission checks must happen on the backend. The frontend should hide unavailable actions, but it is not authoritative.

## Authentication

Supabase Auth is the source of truth for user login, session, and password management.

The app stores operational identity and access in Prisma:

- `StaffProfile` stores staff display name and email.
- `StaffMembership` stores workspace, venue, role, and active status.
- Supabase Auth user ID should be associated with the staff profile. If the current schema does not have a dedicated field, the implementation should add a nullable unique `authUserId` field to `StaffProfile`.

### Seeded First Admin

The first customer admin is created manually by us:

- Create Supabase Auth user.
- Create workspace.
- Create staff profile linked to the auth user.
- Create owner/admin workspace membership.

No public signup is included in this slice.

### Admin-Created Credentials

Admins can create users from the Team screen:

- Email.
- Display name.
- Role.
- Venue access for manager, staff, security, and read-only roles. Owner/admin users can be workspace-wide.
- Active/inactive membership.

The backend uses Supabase service-role admin APIs to create the auth user with a temporary password. It also creates the Prisma staff profile and membership records in one coordinated operation.

The UI shows the generated temporary password once, immediately after creation, with a copy control and a clear warning that the user must change it at first login. Email delivery can be added later; it is not part of this slice.

### Required Password Change

Newly created users have a `mustChangePassword` flag in auth metadata or app metadata. On login:

- If the flag is true, route to a required password-change screen.
- The user enters a new password and confirms it.
- On success, update the Supabase password and clear the flag.
- Only then can the user access the command center.

The Account screen also lets any signed-in user change their password later.

## App Structure

### Login

The login screen is the unauthenticated root experience. It should be visually strong but focused: brand, email/password form, clear error handling, and a compact note that accounts are created by workspace admins.

There is no self-service signup in this slice.

### Required Password Change

The password-change screen blocks the rest of the app. It should explain that the user is using temporary credentials and must set a new password. It should validate password confirmation and show clear backend errors.

### Command Center Shell

The authenticated app shell should include:

- Sidebar navigation.
- Workspace and selected venue context.
- Current user identity and role.
- Sign out.
- Compact status indicators for live operations.

Initial navigation:

- Dashboard.
- Operations.
- Team.
- Venues.
- Service Points.
- Account.

### Dashboard

The dashboard should summarize the platform state:

- Active requests.
- Urgent/high-priority requests.
- Open venues.
- Service points.
- Satisfaction/rating signals where available.
- Recent request or audit activity.

This first slice may use existing request data for operational metrics while the new auth and team APIs are wired to Supabase/Prisma. Any fallback data should be isolated behind typed adapters so it can be replaced by NestJS/Prisma API responses without redesigning the page.

### Team

The Team screen is the core admin credential workflow:

- Staff list.
- Add user form.
- Role selector.
- Venue access selector.
- Temporary password reveal/copy state after creation.
- Active/inactive membership indicator.

Only admins/owners can create users. Managers and staff should see a restricted or read-only state.

### Venues And Service Points

The first slice should expose production-facing management surfaces:

- Venue list and selected venue context.
- Service point list with QR token, label, venue/location, and active state.
- Empty/setup states that make the product feel onboardable.

Full QR printing/export can wait for a later slice, but the interface should reserve space for it.

### Operations

The current admin request dashboard should be redesigned into the Command Center shell. It should retain request listing, assignment, staff replies, status controls, satisfaction signals, and conversation history, but remove demo role-switching as the main production affordance.

## Backend APIs

This slice needs backend support for:

- Reading the current authenticated user's staff profile and memberships.
- Creating staff users through Supabase Admin API.
- Creating staff profiles and memberships in Prisma.
- Updating the current user's password and clearing the required-change flag.
- Listing workspace venues and service points for the authenticated user.

Protected API endpoints should use real Supabase session/JWT verification instead of development headers for browser flows. Existing development-header guards can remain for tests or local API work, but the production web app should not depend on role headers.

## Data Flow

1. User visits `/`.
2. Server/client checks Supabase session.
3. If no session, show login.
4. If session exists, load current staff profile and memberships.
5. If `mustChangePassword` is true, show required password-change screen.
6. If profile or active membership is missing, show a setup-required/support state.
7. Otherwise show the Command Center app shell.

For admin-created users:

1. Admin submits user details.
2. Backend validates admin permission.
3. Backend creates Supabase Auth user with temporary password and password-change metadata.
4. Backend creates or links staff profile.
5. Backend creates staff membership.
6. UI shows the created credentials and updates the team list.

## Error Handling

Expected states:

- Invalid login shows a clear credential error.
- Missing Supabase configuration shows a setup state in development.
- Missing staff profile or membership shows an account-not-configured state.
- Temporary password update failure keeps the user on the password-change screen.
- Admin user creation failure should not create partial visible membership state; if partial backend creation is unavoidable, the error should be logged and reported clearly.
- Duplicate email shows a specific error.
- Permission failure returns `403` and shows a restricted state.
- Network failures preserve form input and allow retry.

## Testing Strategy

Coverage should include:

- Login form validation and error display.
- Session routing states: signed out, temporary password, configured user, missing membership.
- Password-change success and mismatch validation.
- Admin user creation API permission checks.
- Supabase Admin API failure handling with mocked client.
- Staff profile and membership creation.
- Role-aware UI restrictions.
- Command Center app shell smoke test.
- Existing request workflow tests continue to pass.

## Out Of Scope For This Slice

- Public signup.
- Billing.
- Customer self-onboarding.
- Platform-owner workspace creation UI.
- QR PDF/export workflow.
- Full analytics dashboard.
- POS, Slack, Teams, WhatsApp, or SMS integrations.

## Acceptance Criteria

- `/` no longer presents a marketing/demo home page.
- Signed-out users can log in with Supabase Auth credentials.
- Seeded admins can enter the Command Center.
- Admins can create staff credentials from the Team screen.
- Created users must change their temporary password before entering the app.
- The authenticated UI uses the Command Center design direction.
- Users see role-appropriate navigation and restricted states.
- Existing guest QR chat routes remain reachable.
- Tests, lint, build, and relevant auth/API checks pass.
