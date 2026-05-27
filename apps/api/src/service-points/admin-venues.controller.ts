import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import type { AuthContext } from "../auth/auth-context";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateVenueOpeningHoursDto } from "./dto/update-venue-opening-hours.dto";
import { ServicePointsService } from "./service-points.service";

@ApiTags("admin venues")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("admin")
export class AdminVenuesController {
  constructor(private readonly servicePoints: ServicePointsService) {}

  @Get("venues")
  @ApiOkResponse({ description: "Lists venues visible to the authenticated staff profile" })
  listVenues(@CurrentAuth() auth: AuthContext) {
    return this.servicePoints.listVenues(auth);
  }

  @Post("venues")
  @ApiCreatedResponse({ description: "Creates a venue in the authenticated workspace" })
  createVenue(@CurrentAuth() auth: AuthContext, @Body() input: CreateVenueDto) {
    return this.servicePoints.createVenue(auth, input);
  }

  @Post("venues/:venueId/service-points")
  @ApiCreatedResponse({ description: "Creates a QR service point in a venue" })
  createServicePoint(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Body() input: CreateServicePointDto
  ) {
    return this.servicePoints.createServicePoint(auth, venueId, input);
  }

  @Patch("venues/:venueId/opening-hours")
  @ApiOkResponse({ description: "Updates the daily opening schedule for a venue" })
  updateVenueOpeningHours(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Body() input: UpdateVenueOpeningHoursDto
  ) {
    return this.servicePoints.updateVenueOpeningHours(auth, venueId, input);
  }
}
