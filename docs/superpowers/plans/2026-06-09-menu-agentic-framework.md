# Menu Agentic Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build structured venue menu management with CSV import and wire Lily's Menu Concierge framework into public guest chat.

**Architecture:** Add venue-scoped `MenuSection` and `MenuItem` data, expose authenticated admin endpoints through a focused menu module, and reuse the existing `MenuAssistantService` as the synchronous menu answer engine. Public QR and venue QR chat will check for menu answers before ordinary non-request/triage handling, while staff-action and safety-sensitive menu messages continue into the existing request flow with menu metadata.

**Tech Stack:** NestJS, Prisma/Postgres, node:test, class-validator, Next.js React, Supabase-authenticated API client, TypeScript.

---

## File Structure

- Modify: `packages/database/prisma/schema.prisma` to add `MenuSection` and `MenuItem`.
- Create: `supabase/migrations/20260609120000_venue_menus.sql` for the Postgres tables and indexes.
- Create: `apps/api/src/menu/menu-csv.ts` for CSV parsing and normalization.
- Create: `apps/api/src/menu/menu-csv.test.ts` for CSV parser tests.
- Create: `apps/api/src/menu/dto/create-menu-section.dto.ts`.
- Create: `apps/api/src/menu/dto/update-menu-section.dto.ts`.
- Create: `apps/api/src/menu/dto/create-menu-item.dto.ts`.
- Create: `apps/api/src/menu/dto/update-menu-item.dto.ts`.
- Create: `apps/api/src/menu/dto/import-menu-csv.dto.ts`.
- Create: `apps/api/src/menu/menu.service.ts` for admin CRUD, CSV import, and menu retrieval for the assistant.
- Create: `apps/api/src/menu/menu.service.test.ts`.
- Create: `apps/api/src/menu/menu.controller.ts`.
- Create: `apps/api/src/menu/menu.module.ts`.
- Modify: `apps/api/src/app.module.ts` to import `MenuModule`.
- Modify: `apps/api/src/menu/menu-assistant.service.ts` to expose intent/escalation helpers and metadata-friendly output.
- Modify: `apps/api/src/menu/menu-assistant.service.test.ts`.
- Modify: `apps/api/src/service-points/service-points.service.ts` to inject menu services and short-circuit direct menu answers.
- Modify: `apps/api/src/service-points/service-points.module.ts` to import `MenuModule`.
- Modify: `apps/api/src/service-points/service-points.service.test.ts` for public QR direct-answer and escalation coverage.
- Create: `apps/web/lib/menu-controls.ts` for UI payload normalization.
- Create: `apps/web/lib/menu-controls.test.ts`.
- Modify: `apps/web/lib/auth/types.ts` with menu response types.
- Modify: `apps/web/app/components/venues-command.tsx` to add the Menu management surface.

---

### Task 1: Database Menu Models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `supabase/migrations/20260609120000_venue_menus.sql`

- [ ] **Step 1: Add Prisma models**

Add `menuSections MenuSection[]` and `menuItems MenuItem[]` to `model Venue`.

Add these models:

```prisma
model MenuSection {
  id        String     @id @default(uuid()) @db.Uuid
  venueId   String     @db.Uuid
  venue     Venue      @relation(fields: [venueId], references: [id], onDelete: Cascade)
  name      String
  sortOrder Int        @default(0)
  isActive  Boolean    @default(true)
  items     MenuItem[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@unique([venueId, name])
  @@index([venueId, isActive, sortOrder])
}

model MenuItem {
  id          String      @id @default(uuid()) @db.Uuid
  venueId     String      @db.Uuid
  venue       Venue       @relation(fields: [venueId], references: [id], onDelete: Cascade)
  sectionId   String      @db.Uuid
  section     MenuSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  name        String
  description String?
  priceLabel  String?
  dietaryTags String[]    @default([])
  allergens   String[]    @default([])
  available   Boolean     @default(true)
  sortOrder   Int         @default(0)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([venueId, available, sortOrder])
  @@index([sectionId, sortOrder])
}
```

- [ ] **Step 2: Add SQL migration**

Create `supabase/migrations/20260609120000_venue_menus.sql`:

```sql
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
```

- [ ] **Step 3: Verify Prisma schema**

Run: `npm run prisma:generate`

Expected: Prisma client generation succeeds with no schema validation errors.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma supabase/migrations/20260609120000_venue_menus.sql package-lock.json
git commit -m "Add venue menu database models"
```

---

### Task 2: CSV Parser

**Files:**
- Create: `apps/api/src/menu/menu-csv.ts`
- Create: `apps/api/src/menu/menu-csv.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `apps/api/src/menu/menu-csv.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMenuCsv } from "./menu-csv";

describe("parseMenuCsv", () => {
  it("normalizes valid menu rows", () => {
    const result = parseMenuCsv(
      "section,name,description,price,dietary_tags,allergens,available\n" +
        "Mains,Roasted Cauliflower Bowl,Herbs and tahini,GBP 14,vegan|gluten-free,sesame,yes\n"
    );

    assert.deepEqual(result.invalidRows, []);
    assert.deepEqual(result.rows, [
      {
        section: "Mains",
        name: "Roasted Cauliflower Bowl",
        description: "Herbs and tahini",
        priceLabel: "GBP 14",
        dietaryTags: ["vegan", "gluten-free"],
        allergens: ["sesame"],
        available: true
      }
    ]);
  });

  it("reports row numbers for missing required fields and keeps valid rows", () => {
    const result = parseMenuCsv(
      "section,name,description,price,dietary_tags,allergens,available\n" +
        ",Nameless Section,,,,,\n" +
        "Desserts,Lemon Tart,,GBP 8,vegetarian,gluten|milk,no\n"
    );

    assert.deepEqual(result.rows.map((row) => row.name), ["Lemon Tart"]);
    assert.deepEqual(result.invalidRows, [
      {
        rowNumber: 2,
        reason: "section and name are required"
      }
    ]);
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `npm run test -w @guestos/api -- menu-csv.test.ts`

Expected: FAIL because `./menu-csv` does not exist.

- [ ] **Step 3: Implement parser**

Create `apps/api/src/menu/menu-csv.ts`:

```ts
export type ParsedMenuCsvRow = {
  section: string;
  name: string;
  description: string | null;
  priceLabel: string | null;
  dietaryTags: string[];
  allergens: string[];
  available: boolean;
};

export type InvalidMenuCsvRow = {
  rowNumber: number;
  reason: string;
};

export function parseMenuCsv(csv: string): { rows: ParsedMenuCsvRow[]; invalidRows: InvalidMenuCsvRow[] } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return { rows: [], invalidRows: [{ rowNumber: 1, reason: "CSV header is required" }] };
  }

  const headers = splitCsvLine(lines[0]).map((header) => normalizeHeader(header));
  const rows: ParsedMenuCsvRow[] = [];
  const invalidRows: InvalidMenuCsvRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]?.trim() ?? ""]));
    const section = record.section?.trim() ?? "";
    const name = record.name?.trim() ?? "";

    if (!section || !name) {
      invalidRows.push({ rowNumber: index + 1, reason: "section and name are required" });
      continue;
    }

    rows.push({
      section,
      name,
      description: nullableText(record.description),
      priceLabel: nullableText(record.price || record.price_label),
      dietaryTags: splitList(record.dietary_tags),
      allergens: splitList(record.allergens),
      available: parseAvailable(record.available)
    });
  }

  return { rows, invalidRows };
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function nullableText(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function splitList(value: string | undefined) {
  return (value ?? "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAvailable(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["false", "no", "0"].includes(normalized)) {
    return false;
  }
  return true;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
```

- [ ] **Step 4: Run parser tests and verify pass**

Run: `npm run test -w @guestos/api -- menu-csv.test.ts`

Expected: PASS for `menu-csv.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/menu/menu-csv.ts apps/api/src/menu/menu-csv.test.ts
git commit -m "Add menu CSV parser"
```

---

### Task 3: Admin Menu Service And API

**Files:**
- Create: `apps/api/src/menu/dto/create-menu-section.dto.ts`
- Create: `apps/api/src/menu/dto/update-menu-section.dto.ts`
- Create: `apps/api/src/menu/dto/create-menu-item.dto.ts`
- Create: `apps/api/src/menu/dto/update-menu-item.dto.ts`
- Create: `apps/api/src/menu/dto/import-menu-csv.dto.ts`
- Create: `apps/api/src/menu/menu.service.ts`
- Create: `apps/api/src/menu/menu.service.test.ts`
- Create: `apps/api/src/menu/menu.controller.ts`
- Create: `apps/api/src/menu/menu.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/menu/menu.service.test.ts` with these test cases:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MenuService } from "./menu.service";

function createService(prisma: unknown, venueAccess: unknown = { assertCanManageVenue: () => undefined }) {
  return new MenuService(prisma as never, venueAccess as never);
}

const auth = { role: "admin", staffProfileId: "staff_1", workspaceId: "workspace_1" };

describe("MenuService", () => {
  it("lists a venue menu with active sections and ordered items", async () => {
    const calls: unknown[] = [];
    const service = createService({
      venue: {
        findFirst: async (args: unknown) => {
          calls.push(args);
          return { id: "venue_1", workspaceId: "workspace_1" };
        }
      },
      menuSection: {
        findMany: async () => [
          {
            id: "section_1",
            name: "Mains",
            items: [{ id: "item_1", name: "Risotto", dietaryTags: ["vegetarian"], allergens: ["milk"] }]
          }
        ]
      }
    });

    const result = await service.getMenu(auth as never, "venue_1");

    assert.equal((calls[0] as any).where.workspaceId, "workspace_1");
    assert.deepEqual(result.sections[0].items[0].dietaryTags, ["vegetarian"]);
  });

  it("creates a section after venue authorization", async () => {
    let authorized = false;
    const service = createService(
      {
        venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
        menuSection: { create: async (args: unknown) => ({ id: "section_1", ...(args as any).data }) }
      },
      { assertCanManageVenue: () => { authorized = true; } }
    );

    const result = await service.createSection(auth as never, "venue_1", { name: " Mains " });

    assert.equal(authorized, true);
    assert.equal(result.name, "Mains");
  });

  it("rejects item creation when the section belongs to another venue", async () => {
    const service = createService({
      venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
      menuSection: { findFirst: async () => null },
      menuItem: { create: async () => assert.fail("must not create item") }
    });

    await assert.rejects(
      service.createItem(auth as never, "venue_1", { sectionId: "section_2", name: "Burger" } as never),
      BadRequestException
    );
  });

  it("imports valid CSV rows and reports skipped rows", async () => {
    const createdSections: string[] = [];
    const createdItems: string[] = [];
    const service = createService({
      venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
      menuSection: {
        findFirst: async () => null,
        create: async (args: any) => {
          createdSections.push(args.data.name);
          return { id: `section_${createdSections.length}`, name: args.data.name };
        }
      },
      menuItem: {
        create: async (args: any) => {
          createdItems.push(args.data.name);
          return { id: `item_${createdItems.length}`, ...args.data };
        }
      }
    });

    const result = await service.importCsv(auth as never, "venue_1", {
      csv:
        "section,name,description,price,dietary_tags,allergens,available\n" +
        "Mains,Risotto,,GBP 16,vegetarian,milk,true\n" +
        ",Broken,,,,,"
    });

    assert.equal(result.importedCount, 1);
    assert.equal(result.invalidRows[0].rowNumber, 3);
    assert.deepEqual(createdSections, ["Mains"]);
    assert.deepEqual(createdItems, ["Risotto"]);
  });

  it("throws not found before authorization when venue is outside workspace", async () => {
    let authorized = false;
    const service = createService(
      { venue: { findFirst: async () => null } },
      { assertCanManageVenue: () => { authorized = true; } }
    );

    await assert.rejects(service.getMenu(auth as never, "venue_1"), NotFoundException);
    assert.equal(authorized, false);
  });
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run: `npm run test -w @guestos/api -- menu.service.test.ts`

Expected: FAIL because `MenuService` does not exist.

- [ ] **Step 3: Add DTOs**

Create DTOs with class-validator decorators:

```ts
// create-menu-section.dto.ts
import { Transform } from "class-transformer";
import { IsOptional, IsString, MinLength, IsInt, Min, IsBoolean } from "class-validator";

export class CreateMenuSectionDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

Create `UpdateMenuSectionDto`:

```ts
import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class UpdateMenuSectionDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

Create `CreateMenuItemDto`:

```ts
import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class CreateMenuItemDto {
  @IsUUID()
  sectionId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  priceLabel?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

Create `UpdateMenuItemDto`:

```ts
import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class UpdateMenuItemDto {
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  priceLabel?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

Create `ImportMenuCsvDto`:

```ts
import { IsString, MinLength } from "class-validator";

export class ImportMenuCsvDto {
  @IsString()
  @MinLength(1)
  csv!: string;
}
```

- [ ] **Step 4: Implement `MenuService`**

Create `apps/api/src/menu/menu.service.ts` with public methods:

```ts
@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService, private readonly venueAccess: VenueAccessService) {}

  async getMenu(auth: AuthContext, venueId: string) {}
  async listAvailableItemsForVenue(venueId: string) {}
  async createSection(auth: AuthContext, venueId: string, input: CreateMenuSectionDto) {}
  async updateSection(auth: AuthContext, venueId: string, sectionId: string, input: UpdateMenuSectionDto) {}
  async createItem(auth: AuthContext, venueId: string, input: CreateMenuItemDto) {}
  async updateItem(auth: AuthContext, venueId: string, itemId: string, input: UpdateMenuItemDto) {}
  async archiveItem(auth: AuthContext, venueId: string, itemId: string) {}
  async importCsv(auth: AuthContext, venueId: string, input: ImportMenuCsvDto) {}
}
```

Implementation requirements:

- Use `venue.findFirst({ where: { id: venueId, workspaceId: auth.workspaceId } })` before authorization.
- Throw `NotFoundException("Venue not found")` if no venue is found.
- Call `venueAccess.assertCanManageVenue(auth, venueId)` before mutations.
- For item creation/update with `sectionId`, verify the section has matching `venueId`.
- `archiveItem` updates `available: false`.
- `listAvailableItemsForVenue` returns only active sections and available items, ordered by section and item `sortOrder`.
- `importCsv` uses `parseMenuCsv`, creates missing sections, creates valid items, and throws `BadRequestException("No valid menu rows to import")` when all rows are invalid.

- [ ] **Step 5: Add controller and module**

Create `apps/api/src/menu/menu.controller.ts` with the exact endpoints from the spec and `@UseGuards(SupabaseAuthGuard)`.

Create `apps/api/src/menu/menu.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VenuesModule } from "../venues/venues.module";
import { MenuAssistantService } from "./menu-assistant.service";
import { MenuController } from "./menu.controller";
import { MenuService } from "./menu.service";

@Module({
  controllers: [MenuController],
  exports: [MenuAssistantService, MenuService],
  imports: [AuthModule, VenuesModule],
  providers: [MenuAssistantService, MenuService]
})
export class MenuModule {}
```

Import `MenuModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 6: Run service tests and API lint**

Run: `npm run test -w @guestos/api -- menu.service.test.ts menu-csv.test.ts`

Expected: PASS.

Run: `npm run lint -w @guestos/api`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/menu apps/api/src/app.module.ts
git commit -m "Add admin menu API"
```

---

### Task 4: Menu Concierge Assistant Behavior

**Files:**
- Modify: `apps/api/src/menu/menu-assistant.service.ts`
- Modify: `apps/api/src/menu/menu-assistant.service.test.ts`

- [ ] **Step 1: Write failing assistant tests**

Extend `menu-assistant.service.test.ts` with:

```ts
it("marks staff-action menu requests for escalation", () => {
  const service = new MenuAssistantService({ get: (key: string) => key === "MENU_ASSISTANT_ENABLED" ? "true" : undefined } as never);

  assert.deepEqual(service.escalationReason("Can someone come over and confirm if the risotto is safe for my nut allergy?"), "allergen_confirmation");
  assert.deepEqual(service.escalationReason("Can I order the burger please?"), "ordering_help");
  assert.deepEqual(service.escalationReason("What vegan mains do you have?"), null);
});

it("returns framework metadata for handled replies", async () => {
  const service = new MenuAssistantService({ get: (key: string) => key === "MENU_ASSISTANT_ENABLED" ? "true" : undefined } as never);

  const result = await service.answer({
    menu,
    message: "What vegan mains do you have?",
    venueName: "Blue Note"
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.agenticFramework, "menu_concierge");
    assert.equal(result.usedAi, false);
  }
});
```

- [ ] **Step 2: Run assistant tests and verify failure**

Run: `npm run test -w @guestos/api -- menu-assistant.service.test.ts`

Expected: FAIL because `escalationReason` and `agenticFramework` are missing.

- [ ] **Step 3: Implement assistant helpers**

Modify result type for handled results:

```ts
{
  handled: true;
  agenticFramework: "menu_concierge";
  matchedItemIds: string[];
  reply: string;
  usedAi: boolean;
}
```

Add:

```ts
escalationReason(message: string): "allergen_confirmation" | "ordering_help" | "staff_action_requested" | null {
  if (/\b(allerg|anaphyl|severe|safe|confirm)\b/i.test(message) && /\b(confirm|safe|allerg|nut|gluten|dairy|sesame)\b/i.test(message)) {
    return "allergen_confirmation";
  }
  if (/\b(order|buy|bring|get me|can i have)\b/i.test(message)) {
    return "ordering_help";
  }
  if (/\b(someone|staff|waiter|server|team|come over|help me)\b/i.test(message)) {
    return "staff_action_requested";
  }
  return null;
}
```

Ensure both AI and fallback handled results include `agenticFramework: "menu_concierge"`.

- [ ] **Step 4: Run assistant tests and verify pass**

Run: `npm run test -w @guestos/api -- menu-assistant.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/menu/menu-assistant.service.ts apps/api/src/menu/menu-assistant.service.test.ts
git commit -m "Add menu concierge assistant metadata"
```

---

### Task 5: Public Chat Menu Direct Answers

**Files:**
- Modify: `apps/api/src/service-points/service-points.service.ts`
- Modify: `apps/api/src/service-points/service-points.module.ts`
- Modify: `apps/api/src/service-points/service-points.service.test.ts`

- [ ] **Step 1: Write failing public QR direct-answer test**

Add a test to `service-points.service.test.ts` that constructs `ServicePointsService` with `menuService` and `menuAssistant` constructor arguments after the existing optional events argument:

```ts
it("answers public QR menu questions without creating a support request", async () => {
  const servicePoint = { id: "sp_1", venueId: "venue_1", label: "Patio", qrToken: "qr_1", isActive: true, venue: { id: "venue_1", name: "Blue Note", openingHours: [] } };
  const conversation = { id: "conversation_1", venueId: "venue_1", servicePointId: "sp_1" };
  const storedMessages = [
    { id: "guest_1", conversationId: "conversation_1", sender: SenderType.GUEST, body: "What vegan mains do you have?", requestId: null },
    { id: "assistant_1", conversationId: "conversation_1", sender: SenderType.ASSISTANT, body: "The Roasted Cauliflower Bowl is vegan.", requestId: null }
  ];
  let requestCreated = false;
  const tx = {
    conversation: { create: async () => conversation },
    message: { create: async () => ({}), findMany: async () => storedMessages }
  };
  const service = createService(
    {} as never,
    { classifyOrDefault: () => "normal" } as never,
    {
      servicePoint: { findFirst: async () => servicePoint },
      conversation: tx.conversation,
      supportRequest: { create: async () => { requestCreated = true; } },
      message: tx.message,
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
    } as never,
    {} as never,
    undefined,
    { listAvailableItemsForVenue: async () => [{ id: "item_1", name: "Roasted Cauliflower Bowl", category: "Mains", dietaryTags: ["vegan"], allergens: [], available: true }] } as never,
    { escalationReason: () => null, answer: async () => ({ handled: true, agenticFramework: "menu_concierge", matchedItemIds: ["item_1"], reply: "The Roasted Cauliflower Bowl is vegan.", usedAi: false }) } as never
  );

  const result = await service.createGuestMessage("qr_1", { message: "What vegan mains do you have?", sessionId: "session_1" });

  assert.equal((result as any).replyPending, false);
  assert.equal((result as any).request, null);
  assert.equal(requestCreated, false);
});
```

- [ ] **Step 2: Run public chat tests and verify failure**

Run: `npm run test -w @guestos/api -- service-points.service.test.ts`

Expected: FAIL because `ServicePointsService` does not accept menu dependencies and does not answer menu questions.

- [ ] **Step 3: Inject menu dependencies**

Modify constructor:

```ts
@Optional() private readonly events?: DomainEventsService,
@Optional() private readonly menuService?: MenuService,
@Optional() private readonly menuAssistant?: MenuAssistantService
```

Import `MenuModule` in `service-points.module.ts`.

- [ ] **Step 4: Add menu preflight helper**

Add a private helper to `ServicePointsService`:

```ts
private async tryCreateMenuAssistantReply(input: {
  conversationId?: string | null;
  guestSessionId?: string | null;
  message: string;
  metadata: Record<string, unknown>;
  servicePoint: { id: string; venueId: string; label: string };
  venue: { id: string; name: string };
}) {
  if (!this.menuService || !this.menuAssistant) {
    return null;
  }

  const escalationReason = this.menuAssistant.escalationReason(input.message);
  if (escalationReason) {
    return { escalate: true as const, escalationReason };
  }

  const menu = await this.menuService.listAvailableItemsForVenue(input.venue.id);
  const answer = await this.menuAssistant.answer({ menu, message: input.message, venueName: input.venue.name });
  if (!answer.handled) {
    return null;
  }

  return { escalate: false as const, answer };
}
```

Use this helper before the existing non-request path in `createGuestMessage` and `createVenueGuestMessage`.

- [ ] **Step 5: Persist direct menu replies**

For `escalate: false`, create or reuse the conversation, write the guest message with menu metadata, write the assistant reply with:

```ts
metadata: {
  source: "public_qr",
  intent: "menu_concierge",
  agenticFramework: "menu_concierge",
  menuMatchedItemIds: answer.matchedItemIds,
  menuUsedAi: answer.usedAi
}
```

For venue QR, use `source: "public_venue_qr"` and preserve `venueSlug`, `quickAction`, and `locationLabel` metadata.

- [ ] **Step 6: Add escalation metadata to request path**

When the helper returns `escalate: true`, do not answer directly. Let the existing request path continue and include:

```ts
agenticFramework: "menu_concierge",
menuEscalationReason: menuEscalation.escalationReason
```

in guest message and request event metadata.

- [ ] **Step 7: Run public chat tests**

Run: `npm run test -w @guestos/api -- service-points.service.test.ts menu-assistant.service.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/service-points/service-points.service.ts apps/api/src/service-points/service-points.module.ts apps/api/src/service-points/service-points.service.test.ts
git commit -m "Wire menu concierge into public chat"
```

---

### Task 6: Frontend Menu Controls And Types

**Files:**
- Create: `apps/web/lib/menu-controls.ts`
- Create: `apps/web/lib/menu-controls.test.ts`
- Modify: `apps/web/lib/auth/types.ts`

- [ ] **Step 1: Write failing frontend helper tests**

Create `apps/web/lib/menu-controls.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMenuItemPayload, createMenuSectionPayload, parseTagInput } from "./menu-controls";

describe("menu controls", () => {
  it("trims section names", () => {
    assert.deepEqual(createMenuSectionPayload({ name: " Mains ", sortOrder: 2, isActive: true }), {
      name: "Mains",
      sortOrder: 2,
      isActive: true
    });
  });

  it("normalizes item payload tags and nullable text", () => {
    assert.deepEqual(
      createMenuItemPayload({
        sectionId: "section_1",
        name: " Risotto ",
        description: " ",
        priceLabel: " GBP 16 ",
        dietaryTags: "vegetarian, gluten-free",
        allergens: "milk|gluten",
        available: true,
        sortOrder: 1
      }),
      {
        sectionId: "section_1",
        name: "Risotto",
        description: null,
        priceLabel: "GBP 16",
        dietaryTags: ["vegetarian", "gluten-free"],
        allergens: ["milk", "gluten"],
        available: true,
        sortOrder: 1
      }
    );
  });

  it("parses comma and pipe separated tags", () => {
    assert.deepEqual(parseTagInput("vegan | gluten-free, halal"), ["vegan", "gluten-free", "halal"]);
  });
});
```

- [ ] **Step 2: Run web tests and verify failure**

Run: `npm run test -w @guestos/web -- menu-controls.test.ts`

Expected: FAIL because `menu-controls.ts` does not exist.

- [ ] **Step 3: Implement menu controls**

Create `apps/web/lib/menu-controls.ts`:

```ts
export type MenuSectionDraft = {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type MenuItemDraft = {
  sectionId: string;
  name: string;
  description?: string;
  priceLabel?: string;
  dietaryTags?: string;
  allergens?: string;
  available?: boolean;
  sortOrder?: number;
};

export function parseTagInput(value: string | undefined) {
  return (value ?? "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createMenuSectionPayload(draft: MenuSectionDraft) {
  return {
    name: draft.name.trim(),
    ...(typeof draft.sortOrder === "number" ? { sortOrder: draft.sortOrder } : {}),
    ...(typeof draft.isActive === "boolean" ? { isActive: draft.isActive } : {})
  };
}

export function createMenuItemPayload(draft: MenuItemDraft) {
  const description = draft.description?.trim() || null;
  const priceLabel = draft.priceLabel?.trim() || null;

  return {
    sectionId: draft.sectionId,
    name: draft.name.trim(),
    description,
    priceLabel,
    dietaryTags: parseTagInput(draft.dietaryTags),
    allergens: parseTagInput(draft.allergens),
    ...(typeof draft.available === "boolean" ? { available: draft.available } : {}),
    ...(typeof draft.sortOrder === "number" ? { sortOrder: draft.sortOrder } : {})
  };
}
```

- [ ] **Step 4: Add frontend types**

Add to `apps/web/lib/auth/types.ts`:

```ts
export type CommandMenuItem = {
  id: string;
  venueId: string;
  sectionId: string;
  name: string;
  description: string | null;
  priceLabel: string | null;
  dietaryTags: string[];
  allergens: string[];
  available: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CommandMenuSection = {
  id: string;
  venueId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  items: CommandMenuItem[];
  createdAt: string;
  updatedAt: string;
};

export type CommandMenu = {
  sections: CommandMenuSection[];
};
```

- [ ] **Step 5: Run web helper tests**

Run: `npm run test -w @guestos/web -- menu-controls.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/menu-controls.ts apps/web/lib/menu-controls.test.ts apps/web/lib/auth/types.ts
git commit -m "Add web menu control helpers"
```

---

### Task 7: Admin Menu UI

**Files:**
- Modify: `apps/web/app/components/venues-command.tsx`
- Modify: `apps/web/app/globals.css` if existing classes cannot support the layout

- [ ] **Step 1: Add Menu tab state and API calls**

In `VenuesCommand`, import `Upload`, `Utensils`, `Save`, and the new menu helpers/types.

Add state:

```ts
const [activeVenueMenuId, setActiveVenueMenuId] = useState<string | null>(null);
const [menusByVenue, setMenusByVenue] = useState<Record<string, CommandMenu>>({});
const [menuLoadingVenueId, setMenuLoadingVenueId] = useState<string | null>(null);
const [menuImportText, setMenuImportText] = useState<Record<string, string>>({});
const [menuImportResult, setMenuImportResult] = useState<Record<string, { importedCount: number; invalidRows: Array<{ rowNumber: number; reason: string }> }>>({});
```

Add functions:

```ts
async function loadVenueMenu(venueId: string) {
  if (!supabase) return;
  setMenuLoadingVenueId(venueId);
  setError(null);
  try {
    const menu = await apiRequest<CommandMenu>(supabase, `/admin/venues/${venueId}/menu`);
    setMenusByVenue((current) => ({ ...current, [venueId]: menu }));
    setActiveVenueMenuId(venueId);
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : "Could not load menu");
  } finally {
    setMenuLoadingVenueId(null);
  }
}
```

Add these functions:

```ts
async function createMenuSection(venueId: string, draft: MenuSectionDraft) {
  if (!supabase) return;
  const section = await apiRequest<CommandMenuSection>(supabase, `/admin/venues/${venueId}/menu/sections`, {
    method: "POST",
    body: JSON.stringify(createMenuSectionPayload(draft))
  });
  setMenusByVenue((current) => ({
    ...current,
    [venueId]: {
      sections: [...(current[venueId]?.sections ?? []), { ...section, items: section.items ?? [] }]
    }
  }));
}

async function createMenuItem(venueId: string, draft: MenuItemDraft) {
  if (!supabase) return;
  const item = await apiRequest<CommandMenuItem>(supabase, `/admin/venues/${venueId}/menu/items`, {
    method: "POST",
    body: JSON.stringify(createMenuItemPayload(draft))
  });
  setMenusByVenue((current) => ({
    ...current,
    [venueId]: {
      sections: (current[venueId]?.sections ?? []).map((section) =>
        section.id === item.sectionId ? { ...section, items: [...section.items, item] } : section
      )
    }
  }));
}

async function updateMenuItem(venueId: string, itemId: string, patch: Partial<MenuItemDraft>) {
  if (!supabase) return;
  const item = await apiRequest<CommandMenuItem>(supabase, `/admin/venues/${venueId}/menu/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  setMenusByVenue((current) => ({
    ...current,
    [venueId]: {
      sections: (current[venueId]?.sections ?? []).map((section) => ({
        ...section,
        items: section.items.map((existing) => (existing.id === item.id ? item : existing))
      }))
    }
  }));
}

async function archiveMenuItem(venueId: string, itemId: string) {
  if (!supabase) return;
  const item = await apiRequest<CommandMenuItem>(supabase, `/admin/venues/${venueId}/menu/items/${itemId}`, {
    method: "DELETE"
  });
  setMenusByVenue((current) => ({
    ...current,
    [venueId]: {
      sections: (current[venueId]?.sections ?? []).map((section) => ({
        ...section,
        items: section.items.map((existing) => (existing.id === item.id ? item : existing))
      }))
    }
  }));
}

async function importMenuCsv(venueId: string) {
  if (!supabase) return;
  const result = await apiRequest<{ importedCount: number; invalidRows: Array<{ rowNumber: number; reason: string }> }>(
    supabase,
    `/admin/venues/${venueId}/menu/imports/csv`,
    {
      method: "POST",
      body: JSON.stringify({ csv: menuImportText[venueId] ?? "" })
    }
  );
  setMenuImportResult((current) => ({ ...current, [venueId]: result }));
  await loadVenueMenu(venueId);
}
```

- [ ] **Step 2: Render Menu surface**

Within each venue card, add an icon button labeled `Manage menu`. When active, render a compact panel under that venue with:

- Section list with item counts.
- Form for new section.
- Form for new item with section picker, name, price, description, dietary tags, allergens, availability.
- Item rows with availability toggle and archive button.
- CSV textarea and import button.
- Import result showing imported count and invalid rows.

Use icons for direct commands and concise labels for form fields.

- [ ] **Step 3: Run frontend tests and lint**

Run: `npm run test -w @guestos/web -- menu-controls.test.ts venue-controls.test.ts`

Expected: PASS.

Run: `npm run lint -w @guestos/web`

Expected: PASS. Fix lint issues in touched files only.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/venues-command.tsx apps/web/app/globals.css
git commit -m "Add venue menu management UI"
```

---

### Task 8: Full Verification

**Files:**
- No planned source edits unless verification reveals a failure.

- [ ] **Step 1: Run backend tests**

Run: `npm run test -w @guestos/api`

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run: `npm run test -w @guestos/web`

Expected: PASS.

- [ ] **Step 3: Run workspace build**

Run: `npm run build --workspaces --if-present`

Expected: PASS.

- [ ] **Step 4: Start local web server**

Run: `WEB_PORT=3001 npm run dev:web`

Expected: Next.js starts on `http://localhost:3001`.

- [ ] **Step 5: Browser smoke test**

Open `http://localhost:3001/command` in the in-app browser or Playwright. Verify:

- Venues load.
- A venue card exposes the Menu surface.
- Section and item forms fit without overlapping.
- CSV textarea and import result area are visible.
- Existing QR point controls still render.

- [ ] **Step 6: Commit verification fixes if any**

If verification required fixes:

```bash
git status --short
git add apps/api/src apps/web/app apps/web/lib packages/database/prisma/schema.prisma supabase/migrations
git commit -m "Fix menu feature verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: database models, admin API, CSV import, admin UI, Menu Concierge framework, public chat direct replies, escalation metadata, and tests are covered by Tasks 1-8.
- Out-of-scope items remain excluded: photo extraction, PDF extraction, OCR, AI import drafts, item images, translations, and POS sync.
- Type consistency: plan uses `MenuSection`, `MenuItem`, `CommandMenuSection`, `CommandMenuItem`, `CommandMenu`, `menu_concierge`, `menuMatchedItemIds`, `menuUsedAi`, and `menuEscalationReason` consistently.
