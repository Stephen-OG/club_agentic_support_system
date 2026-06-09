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
    assert.deepEqual(result.sections[0]!.items[0]!.dietaryTags, ["vegetarian"]);
  });

  it("creates a section after venue authorization", async () => {
    let authorized = false;
    const service = createService(
      {
        venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
        menuSection: { create: async (args: unknown) => ({ id: "section_1", ...(args as any).data }) }
      },
      {
        assertCanManageVenue: () => {
          authorized = true;
        }
      }
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
    assert.equal(result.invalidRows[0]!.rowNumber, 3);
    assert.deepEqual(createdSections, ["Mains"]);
    assert.deepEqual(createdItems, ["Risotto"]);
  });

  it("throws not found before authorization when venue is outside workspace", async () => {
    let authorized = false;
    const service = createService(
      { venue: { findFirst: async () => null } },
      {
        assertCanManageVenue: () => {
          authorized = true;
        }
      }
    );

    await assert.rejects(service.getMenu(auth as never, "venue_1"), NotFoundException);
    assert.equal(authorized, false);
  });
});
