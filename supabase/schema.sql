create extension if not exists "pgcrypto";

create type request_status as enum ('new', 'acknowledged', 'declined', 'in_progress', 'completed', 'resolved', 'cancelled');
create type request_priority as enum ('low', 'normal', 'high', 'urgent');
create type sender_type as enum ('guest', 'assistant', 'staff', 'system');

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table club_tables (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  label text not null,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  zone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (club_id, label)
);

create table staff_profiles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  display_name text not null,
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  table_id uuid not null references club_tables(id) on delete cascade,
  guest_label text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table support_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  table_id uuid not null references club_tables(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  status request_status not null default 'new',
  priority request_priority not null default 'normal',
  assigned_to uuid references staff_profiles(id) on delete set null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  table_id uuid not null references club_tables(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  request_id uuid references support_requests(id) on delete set null,
  sender sender_type not null,
  body text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_messages_conversation_created on messages(conversation_id, created_at);
create index idx_requests_club_status_created on support_requests(club_id, status, created_at desc);
create index idx_conversations_table_updated on conversations(table_id, updated_at desc);

alter table clubs enable row level security;
alter table club_tables enable row level security;
alter table staff_profiles enable row level security;
alter table conversations enable row level security;
alter table support_requests enable row level security;
alter table messages enable row level security;

create or replace function public.staff_club_id()
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select club_id from staff_profiles where id = auth.uid()
$$;

create policy "staff can read own club" on clubs
for select using (id = public.staff_club_id());

create policy "staff can read tables" on club_tables
for select using (club_id = public.staff_club_id());

create policy "staff can read profiles" on staff_profiles
for select using (club_id = public.staff_club_id());

create policy "staff can read conversations" on conversations
for select using (club_id = public.staff_club_id());

create policy "staff can read requests" on support_requests
for select using (club_id = public.staff_club_id());

create policy "staff can update requests" on support_requests
for update using (club_id = public.staff_club_id())
with check (club_id = public.staff_club_id());

create policy "staff can read messages" on messages
for select using (club_id = public.staff_club_id());

create policy "staff can insert messages" on messages
for insert with check (club_id = public.staff_club_id() and sender = 'staff');

create or replace function set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger conversations_updated_at
before update on conversations
for each row execute function set_updated_at();

create trigger support_requests_updated_at
before update on support_requests
for each row execute function set_updated_at();
