create table if not exists "MenuSection" (
  "id" uuid primary key default gen_random_uuid(),
  "venueId" uuid not null references "Venue"("id") on delete cascade,
  "name" text not null,
  "sortOrder" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "MenuSection_venueId_name_key" unique ("venueId", "name")
);

create table if not exists "MenuItem" (
  "id" uuid primary key default gen_random_uuid(),
  "venueId" uuid not null references "Venue"("id") on delete cascade,
  "sectionId" uuid not null references "MenuSection"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "priceLabel" text,
  "dietaryTags" text[] not null default array[]::text[],
  "allergens" text[] not null default array[]::text[],
  "available" boolean not null default true,
  "sortOrder" integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "MenuSection_venueId_isActive_sortOrder_idx"
  on "MenuSection" ("venueId", "isActive", "sortOrder");

create index if not exists "MenuItem_venueId_available_sortOrder_idx"
  on "MenuItem" ("venueId", "available", "sortOrder");

create index if not exists "MenuItem_sectionId_sortOrder_idx"
  on "MenuItem" ("sectionId", "sortOrder");
