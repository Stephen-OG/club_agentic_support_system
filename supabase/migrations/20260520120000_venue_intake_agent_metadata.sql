alter table if exists "Conversation"
  add column if not exists "guestLocationLabel" text,
  add column if not exists "guestLocationSource" text;

alter table if exists "SupportRequest"
  add column if not exists "guestLocationLabel" text,
  add column if not exists "guestLocationSource" text,
  add column if not exists "agentPolicyVersion" text,
  add column if not exists "agentConfidence" double precision,
  add column if not exists "agentSuggestedAction" text;
