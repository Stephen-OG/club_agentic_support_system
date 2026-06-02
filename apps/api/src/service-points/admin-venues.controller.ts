import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import type { AuthContext } from "../auth/auth-context";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueLocationDto } from "./dto/create-venue-location.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateServicePointDto } from "./dto/update-service-point.dto";
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

  @Patch("venues/:venueId/service-points/:servicePointId")
  @ApiOkResponse({ description: "Updates a QR service point in a venue" })
  updateServicePoint(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Param("servicePointId", ParseUUIDPipe) servicePointId: string,
    @Body() input: UpdateServicePointDto
  ) {
    return this.servicePoints.updateServicePoint(auth, venueId, servicePointId, input);
  }

  @Delete("venues/:venueId/service-points/:servicePointId")
  @ApiOkResponse({ description: "Archives a QR service point in a venue" })
  deleteServicePoint(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Param("servicePointId", ParseUUIDPipe) servicePointId: string
  ) {
    return this.servicePoints.deleteServicePoint(auth, venueId, servicePointId);
  }

  @Post("venues/:venueId/locations")
  @ApiCreatedResponse({ description: "Creates a zone/location in a venue" })
  createVenueLocation(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId", ParseUUIDPipe) venueId: string,
    @Body() input: CreateVenueLocationDto
  ) {
    return this.servicePoints.createVenueLocation(auth, venueId, input);
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
