-- Enable row level security for production public tables exposed to PostgREST.
-- These tables are reported by Supabase linter as public and missing RLS.

alter table public."Workspace" enable row level security;
alter table public."ServicePoint" enable row level security;
alter table public."Venue" enable row level security;
alter table public."VenueLocation" enable row level security;
alter table public."Conversation" enable row level security;
alter table public."Message" enable row level security;
alter table public."SupportRequest" enable row level security;
alter table public."RequestAssignment" enable row level security;
alter table public."AuditLog" enable row level security;
alter table public."AiTriageLog" enable row level security;
alter table public."StaffMembership" enable row level security;
alter table public."StaffProfile" enable row level security;
alter table public."RequestEvent" enable row level security;
alter table public."Integration" enable row level security;
alter table public."NotificationDelivery" enable row level security;
alter table public."RateLimitEvent" enable row level security;
alter table public."WebhookEndpoint" enable row level security;
alter table public."WebhookDelivery" enable row level security;
alter table public."BillingAccount" enable row level security;
