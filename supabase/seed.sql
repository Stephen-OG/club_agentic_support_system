insert into clubs (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Demo Club', 'demo-club')
on conflict (slug) do nothing;

insert into club_tables (club_id, label, zone, qr_token)
values
  ('00000000-0000-0000-0000-000000000001', 'Table 1', 'Main Floor', 'demo-table-1'),
  ('00000000-0000-0000-0000-000000000001', 'Table 2', 'Main Floor', 'demo-table-2'),
  ('00000000-0000-0000-0000-000000000001', 'Table 3', 'Main Floor', 'demo-table-3'),
  ('00000000-0000-0000-0000-000000000001', 'Table 4', 'Main Floor', 'demo-table-4'),
  ('00000000-0000-0000-0000-000000000001', 'VIP 1', 'VIP', 'demo-vip-1')
on conflict (qr_token) do nothing;

insert into staff_profiles (id, club_id, display_name, role)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maya Manager', 'manager'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Alex Admin', 'admin'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Sam Staff', 'staff'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Riley Runner', 'staff')
on conflict (id) do update set
  display_name = excluded.display_name,
  role = excluded.role;
