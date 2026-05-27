drop table if exists public.messages cascade;
drop table if exists public.support_requests cascade;
drop table if exists public.conversations cascade;
drop table if exists public.staff_profiles cascade;
drop table if exists public.club_tables cascade;
drop table if exists public.clubs cascade;

drop function if exists public.staff_club_id();

drop type if exists public.sender_type;
drop type if exists public.request_priority;
drop type if exists public.request_status;
