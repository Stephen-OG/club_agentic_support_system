import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import type { AuthContext } from "../auth/auth-context";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { CreateMenuItemDto } from "./dto/create-menu-item.dto";
import { CreateMenuSectionDto } from "./dto/create-menu-section.dto";
import { ImportMenuCsvDto } from "./dto/import-menu-csv.dto";
import { UpdateMenuItemDto } from "./dto/update-menu-item.dto";
import { UpdateMenuSectionDto } from "./dto/update-menu-section.dto";
import { MenuService } from "./menu.service";

@ApiTags("admin menu")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("admin")
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get("venues/:venueId/menu")
  @ApiOkResponse({ description: "Returns the active menu sections and ordered menu items for a venue" })
  getMenu(@CurrentAuth() auth: AuthContext, @Param("venueId", ParseUUIDPipe) venueId: string) {
    return this.menu.getMenu(auth, venueId);
  }

  @Post("venues/:venueId/menu/sections")
  @ApiCreatedResponse({ description: "Creates a menu section in a venue" })
  createSection(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Body() input: CreateMenuSectionDto
  ) {
    return this.menu.createSection(auth, venueId, input);
  }

  @Patch("venues/:venueId/menu/sections/:sectionId")
  @ApiOkResponse({ description: "Updates a menu section in a venue" })
  updateSection(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Param("sectionId", ParseUUIDPipe) sectionId: string,
    @Body() input: UpdateMenuSectionDto
  ) {
    return this.menu.updateSection(auth, venueId, sectionId, input);
  }

  @Post("venues/:venueId/menu/items")
  @ApiCreatedResponse({ description: "Creates a menu item in a venue section" })
  createItem(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Body() input: CreateMenuItemDto
  ) {
    return this.menu.createItem(auth, venueId, input);
  }

  @Patch("venues/:venueId/menu/items/:itemId")
  @ApiOkResponse({ description: "Updates a menu item in a venue" })
  updateItem(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() input: UpdateMenuItemDto
  ) {
    return this.menu.updateItem(auth, venueId, itemId, input);
  }

  @Delete("venues/:venueId/menu/items/:itemId")
  @ApiOkResponse({ description: "Archives a menu item in a venue" })
  archiveItem(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string
  ) {
    return this.menu.archiveItem(auth, venueId, itemId);
  }

  @Post("venues/:venueId/menu/imports/csv")
  @ApiCreatedResponse({ description: "Imports menu sections and items from CSV" })
  importCsv(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Body() input: ImportMenuCsvDto
  ) {
    return this.menu.importCsv(auth, venueId, input);
  }
}
