create table if not exists "VenueOpeningHour" (
  "id" uuid primary key default gen_random_uuid(),
  "venueId" uuid not null references "Venue"("id") on delete cascade,
  "dayOfWeek" integer not null check ("dayOfWeek" >= 0 and "dayOfWeek" <= 6),
  "opensAt" text not null check ("opensAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "closesAt" text not null check ("closesAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "isClosed" boolean not null default false,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "VenueOpeningHour_venueId_dayOfWeek_key" unique ("venueId", "dayOfWeek")
);

create index if not exists "VenueOpeningHour_venueId_idx" on "VenueOpeningHour"("venueId");

insert into "VenueOpeningHour" ("venueId", "dayOfWeek", "opensAt", "closesAt", "isClosed")
select v."id", day_number, '09:00', '23:00', false
from "Venue" v
cross join generate_series(0, 6) as day_number
on conflict ("venueId", "dayOfWeek") do nothing;
