insert into clubs (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Demo Club', 'demo-club')
on conflict (slug) do nothing;

insert into club_tables (club_id, label, zone, qr_token)
values
  ('00000000-0000-0000-0000-000000000001', 'Table 1', 'Main Floor', 'demo-table-1'),
  ('00000000-0000-0000-0000-000000000001', 'Table 2', 'Main Floor', 'demo-table-2'),
  ('00000000-0000-0000-0000-000000000001', 'VIP 1', 'VIP', 'demo-vip-1')
on conflict (qr_token) do nothing;
