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

  it("lists available venue items for the menu assistant", async () => {
    const calls: unknown[] = [];
    const service = createService({
      menuSection: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return [
            {
              id: "section_1",
              name: "Mains",
              items: [
                {
                  id: "item_1",
                  name: "Risotto",
                  description: "Wild mushroom risotto",
                  priceLabel: "GBP 16",
                  dietaryTags: ["vegetarian"],
                  allergens: ["milk"],
                  available: true
                }
              ]
            }
          ];
        }
      }
    });

    const result = await service.listAvailableItemsForVenue("venue_1");

    assert.deepEqual(calls[0], {
      where: {
        venueId: "venue_1",
        isActive: true
      },
      include: {
        items: {
          where: {
            available: true
          },
          orderBy: [
            {
              sortOrder: "asc"
            },
            {
              name: "asc"
            }
          ]
        }
      },
      orderBy: [
        {
          sortOrder: "asc"
        },
        {
          name: "asc"
        }
      ]
    });
    assert.deepEqual(result, [
      {
        id: "item_1",
        name: "Risotto",
        category: "Mains",
        description: "Wild mushroom risotto",
        priceLabel: "GBP 16",
        dietaryTags: ["vegetarian"],
        allergens: ["milk"],
        available: true
      }
    ]);
  });

  it("updates a section after venue authorization and section scope checks", async () => {
    let authorized = false;
    const updates: unknown[] = [];
    const sectionLookups: unknown[] = [];
    const service = createService(
      {
        venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
        menuSection: {
          findFirst: async (args: unknown) => {
            sectionLookups.push(args);
            return { id: "section_1", venueId: "venue_1" };
          },
          update: async (args: unknown) => {
            updates.push(args);
            return { id: "section_1", ...(args as any).data };
          }
        }
      },
      {
        assertCanManageVenue: () => {
          authorized = true;
        }
      }
    );

    const result = await service.updateSection(auth as never, "venue_1", "section_1", {
      name: " Starters ",
      sortOrder: 2,
      isActive: false
    });

    assert.equal(authorized, true);
    assert.deepEqual(sectionLookups[0], {
      where: {
        id: "section_1",
        venueId: "venue_1"
      }
    });
    assert.deepEqual(updates[0], {
      where: {
        id: "section_1"
      },
      data: {
        name: "Starters",
        sortOrder: 2,
        isActive: false
      }
    });
    assert.equal(result.name, "Starters");
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

  it("updates an item after verifying the new section belongs to the venue", async () => {
    let authorized = false;
    const sectionLookups: unknown[] = [];
    const itemLookups: unknown[] = [];
    const updates: unknown[] = [];
    const service = createService(
      {
        venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
        menuSection: {
          findFirst: async (args: unknown) => {
            sectionLookups.push(args);
            return { id: "section_2", venueId: "venue_1" };
          }
        },
        menuItem: {
          findFirst: async (args: unknown) => {
            itemLookups.push(args);
            return { id: "item_1", venueId: "venue_1", sectionId: "section_1" };
          },
          update: async (args: unknown) => {
            updates.push(args);
            return { id: "item_1", ...(args as any).data };
          }
        }
      },
      {
        assertCanManageVenue: () => {
          authorized = true;
        }
      }
    );

    const result = await service.updateItem(auth as never, "venue_1", "item_1", {
      sectionId: "section_2",
      name: " Burger ",
      description: " House burger ",
      priceLabel: " GBP 18 ",
      dietaryTags: [" beef ", ""],
      allergens: [" gluten "],
      available: false,
      sortOrder: 4
    } as never);

    assert.equal(authorized, true);
    assert.deepEqual(itemLookups[0], {
      where: {
        id: "item_1",
        venueId: "venue_1"
      }
    });
    assert.deepEqual(sectionLookups[0], {
      where: {
        id: "section_2",
        venueId: "venue_1"
      }
    });
    assert.deepEqual(updates[0], {
      where: {
        id: "item_1"
      },
      data: {
        sectionId: "section_2",
        name: "Burger",
        description: "House burger",
        priceLabel: "GBP 18",
        dietaryTags: ["beef"],
        allergens: ["gluten"],
        available: false,
        sortOrder: 4
      }
    });
    assert.equal(result.name, "Burger");
  });

  it("archives an item by setting available false after authorization", async () => {
    let authorized = false;
    const updates: unknown[] = [];
    const service = createService(
      {
        venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
        menuItem: {
          findFirst: async () => ({ id: "item_1", venueId: "venue_1" }),
          update: async (args: unknown) => {
            updates.push(args);
            return { id: "item_1", available: (args as any).data.available };
          }
        }
      },
      {
        assertCanManageVenue: () => {
          authorized = true;
        }
      }
    );

    const result = await service.archiveItem(auth as never, "venue_1", "item_1");

    assert.equal(authorized, true);
    assert.deepEqual(updates[0], {
      where: {
        id: "item_1"
      },
      data: {
        available: false
      }
    });
    assert.equal(result.available, false);
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

  it("throws when CSV import has no valid rows", async () => {
    const service = createService({
      venue: { findFirst: async () => ({ id: "venue_1", workspaceId: "workspace_1" }) },
      menuSection: {
        create: async () => assert.fail("must not create section")
      },
      menuItem: {
        create: async () => assert.fail("must not create item")
      }
    });

    await assert.rejects(
      service.importCsv(auth as never, "venue_1", {
        csv: "section,name,description,price,dietary_tags,allergens,available\n,Broken,,,,,"
      }),
      (error: unknown) => error instanceof BadRequestException && error.message === "No valid menu rows to import"
    );
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
