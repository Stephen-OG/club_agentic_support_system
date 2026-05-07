insert into club_tables (club_id, label, zone, qr_token)
values
  ('00000000-0000-0000-0000-000000000001', 'Table 3', 'Main Floor', 'demo-table-3'),
  ('00000000-0000-0000-0000-000000000001', 'Table 4', 'Main Floor', 'demo-table-4'),
  ('00000000-0000-0000-0000-000000000001', 'VIP 1', 'VIP', 'demo-vip-1')
on conflict (qr_token) do nothing;
