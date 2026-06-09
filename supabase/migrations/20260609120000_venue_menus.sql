create table if not exists "MenuSection" (
  "id" uuid primary key default gen_random_uuid(),
  "venueId" uuid not null references "Venue"("id") on delete cascade,
  "name" text not null,
  "sortOrder" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "MenuSection_venueId_name_key" unique ("venueId", "name"),
  constraint "MenuSection_id_venueId_key" unique ("id", "venueId")
);

create table if not exists "MenuItem" (
  "id" uuid primary key default gen_random_uuid(),
  "venueId" uuid not null references "Venue"("id") on delete cascade,
  "sectionId" uuid not null,
  "name" text not null,
  "description" text,
  "priceLabel" text,
  "dietaryTags" text[] not null default array[]::text[],
  "allergens" text[] not null default array[]::text[],
  "available" boolean not null default true,
  "sortOrder" integer not null default 0,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "MenuItem_sectionId_venueId_fkey"
    foreign key ("sectionId", "venueId") references "MenuSection"("id", "venueId") on delete cascade
);

create index if not exists "MenuSection_venueId_isActive_sortOrder_idx"
  on "MenuSection" ("venueId", "isActive", "sortOrder");

create index if not exists "MenuItem_venueId_available_sortOrder_idx"
  on "MenuItem" ("venueId", "available", "sortOrder");

create index if not exists "MenuItem_sectionId_sortOrder_idx"
  on "MenuItem" ("sectionId", "sortOrder");
