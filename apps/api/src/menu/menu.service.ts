import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { VenueAccessService } from "../venues/access.service";
import { CreateMenuItemDto } from "./dto/create-menu-item.dto";
import { CreateMenuSectionDto } from "./dto/create-menu-section.dto";
import { ImportMenuCsvDto } from "./dto/import-menu-csv.dto";
import { UpdateMenuItemDto } from "./dto/update-menu-item.dto";
import { UpdateMenuSectionDto } from "./dto/update-menu-section.dto";
import { parseMenuCsv } from "./menu-csv";

type VenueSummary = {
  id: string;
  workspaceId: string;
};

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  async getMenu(auth: AuthContext, venueId: string) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.venueAccess.assertCanReadVenue(auth, { workspaceId: venue.workspaceId, venueId: venue.id });

    const sections = await this.prisma.menuSection.findMany({
      where: {
        venueId,
        isActive: true
      },
      include: {
        items: {
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

    return { sections };
  }

  async listAvailableItemsForVenue(venueId: string) {
    const sections = await this.prisma.menuSection.findMany({
      where: {
        venueId,
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

    return sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.id,
        name: item.name,
        category: section.name,
        description: item.description,
        priceLabel: item.priceLabel,
        dietaryTags: item.dietaryTags,
        allergens: item.allergens,
        available: item.available
      }))
    );
  }

  async createSection(auth: AuthContext, venueId: string, input: CreateMenuSectionDto) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.assertCanManageVenue(auth, venue);

    return this.prisma.menuSection.create({
      data: {
        venueId,
        name: input.name.trim(),
        sortOrder: input.sortOrder,
        isActive: input.isActive
      }
    });
  }

  async updateSection(auth: AuthContext, venueId: string, sectionId: string, input: UpdateMenuSectionDto) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.assertCanManageVenue(auth, venue);
    await this.getSectionInVenue(venueId, sectionId);

    return this.prisma.menuSection.update({
      where: {
        id: sectionId
      },
      data: this.sectionUpdateData(input)
    });
  }

  async createItem(auth: AuthContext, venueId: string, input: CreateMenuItemDto) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.assertCanManageVenue(auth, venue);
    await this.assertSectionMatchesVenue(venueId, input.sectionId);

    return this.prisma.menuItem.create({
      data: {
        venueId,
        ...this.itemCreateData(input)
      }
    });
  }

  async updateItem(auth: AuthContext, venueId: string, itemId: string, input: UpdateMenuItemDto) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.assertCanManageVenue(auth, venue);
    await this.getItemInVenue(venueId, itemId);

    if (input.sectionId) {
      await this.assertSectionMatchesVenue(venueId, input.sectionId);
    }

    return this.prisma.menuItem.update({
      where: {
        id: itemId
      },
      data: this.itemUpdateData(input)
    });
  }

  async archiveItem(auth: AuthContext, venueId: string, itemId: string) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.assertCanManageVenue(auth, venue);
    await this.getItemInVenue(venueId, itemId);

    return this.prisma.menuItem.update({
      where: {
        id: itemId
      },
      data: {
        available: false
      }
    });
  }

  async importCsv(auth: AuthContext, venueId: string, input: ImportMenuCsvDto) {
    const venue = await this.getVenueInWorkspace(auth, venueId);
    this.assertCanManageVenue(auth, venue);

    const parsed = parseMenuCsv(input.csv);
    if (!parsed.rows.length) {
      throw new BadRequestException("No valid menu rows to import");
    }

    const importedItems = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("select pg_advisory_xact_lock(hashtext($1))", `menu-import:${venueId}`);

      const sectionsByName = new Map<string, { id: string; name: string }>();
      const appliedItems = [];

      for (const row of parsed.rows) {
        let section = sectionsByName.get(row.section);

        if (!section) {
          section =
            (await tx.menuSection.findFirst({
              where: {
                venueId,
                name: row.section
              }
            })) ??
            (await tx.menuSection.create({
              data: {
                venueId,
                name: row.section
              }
            }));
          sectionsByName.set(row.section, section);
        }

        const data = {
          name: row.name,
          description: row.description,
          priceLabel: row.priceLabel,
          dietaryTags: row.dietaryTags,
          allergens: row.allergens,
          available: row.available
        };
        const existingItem = await tx.menuItem.findFirst({
          where: {
            venueId,
            sectionId: section.id,
            name: row.name
          }
        });

        appliedItems.push(
          existingItem
            ? await tx.menuItem.update({
                where: {
                  id: existingItem.id
                },
                data
              })
            : await tx.menuItem.create({
                data: {
                  venueId,
                  sectionId: section.id,
                  ...data
                }
              })
        );
      }

      return appliedItems;
    });

    return {
      importedCount: importedItems.length,
      invalidRows: parsed.invalidRows,
      items: importedItems
    };
  }

  private async getVenueInWorkspace(auth: AuthContext, venueId: string): Promise<VenueSummary> {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        workspaceId: auth.workspaceId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    return venue;
  }

  private assertCanManageVenue(auth: AuthContext, venue: VenueSummary) {
    this.venueAccess.assertCanManageVenue(auth, { workspaceId: venue.workspaceId, venueId: venue.id });
  }

  private async getSectionInVenue(venueId: string, sectionId: string) {
    const section = await this.prisma.menuSection.findFirst({
      where: {
        id: sectionId,
        venueId
      }
    });

    if (!section) {
      throw new NotFoundException("Menu section not found");
    }

    return section;
  }

  private async assertSectionMatchesVenue(venueId: string, sectionId: string) {
    const section = await this.prisma.menuSection.findFirst({
      where: {
        id: sectionId,
        venueId
      }
    });

    if (!section) {
      throw new BadRequestException("Menu section must belong to this venue");
    }
  }

  private async getItemInVenue(venueId: string, itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: itemId,
        venueId
      }
    });

    if (!item) {
      throw new NotFoundException("Menu item not found");
    }

    return item;
  }

  private sectionUpdateData(input: UpdateMenuSectionDto) {
    return {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    };
  }

  private itemCreateData(input: CreateMenuItemDto) {
    return {
      sectionId: input.sectionId,
      name: input.name.trim(),
      description: nullableText(input.description),
      priceLabel: nullableText(input.priceLabel),
      dietaryTags: normalizeList(input.dietaryTags),
      allergens: normalizeList(input.allergens),
      available: input.available,
      sortOrder: input.sortOrder
    };
  }

  private itemUpdateData(input: UpdateMenuItemDto) {
    return {
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: nullableText(input.description) } : {}),
      ...(input.priceLabel !== undefined ? { priceLabel: nullableText(input.priceLabel) } : {}),
      ...(input.dietaryTags !== undefined ? { dietaryTags: normalizeList(input.dietaryTags) } : {}),
      ...(input.allergens !== undefined ? { allergens: normalizeList(input.allergens) } : {}),
      ...(input.available !== undefined ? { available: input.available } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
    };
  }
}

function nullableText(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeList(value: string[] | undefined) {
  return value?.map((item) => item.trim()).filter(Boolean);
}
