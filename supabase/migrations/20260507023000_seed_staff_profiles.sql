alter table staff_profiles
  alter column id set default gen_random_uuid();

alter table staff_profiles
  drop constraint if exists staff_profiles_id_fkey;

insert into clubs (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Demo Club', 'demo-club')
on conflict (slug) do nothing;

insert into staff_profiles (id, club_id, display_name, role)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maya Manager', 'manager'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Alex Admin', 'admin'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Sam Staff', 'staff'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Riley Runner', 'staff')
on conflict (id) do update set
  display_name = excluded.display_name,
  role = excluded.role;
