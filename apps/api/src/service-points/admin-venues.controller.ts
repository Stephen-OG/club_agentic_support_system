import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { DevAuthGuard } from "../auth/dev-auth.guard";
import type { AuthContext } from "../auth/auth-context";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { ServicePointsService } from "./service-points.service";

@ApiTags("admin venues")
@ApiBearerAuth()
@UseGuards(DevAuthGuard)
@Controller("admin")
export class AdminVenuesController {
  constructor(private readonly servicePoints: ServicePointsService) {}

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
}
