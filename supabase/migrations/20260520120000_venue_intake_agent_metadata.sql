alter table conversations
  add column if not exists guest_location_label text,
  add column if not exists guest_location_source text;

alter table support_requests
  add column if not exists guest_location_label text,
  add column if not exists guest_location_source text,
  add column if not exists agent_policy_version text,
  add column if not exists agent_confidence double precision,
  add column if not exists agent_suggested_action text;
