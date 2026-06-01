alter table if exists "Conversation"
  add column if not exists "closedAt" timestamp(3);
