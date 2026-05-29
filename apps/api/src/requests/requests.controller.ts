import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { GuestRequestActionDto } from "./dto/guest-request-action.dto";
import { UpdateRequestStatusDto } from "./dto/update-request-status.dto";
import { RequestsService } from "./requests.service";

@ApiTags("requests")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get("venues/:venueId/requests")
  @ApiOkResponse({ description: "Lists support requests for a venue" })
  listForVenue(@CurrentAuth() auth: AuthContext, @Param("venueId", ParseUUIDPipe) venueId: string) {
    return this.requests.listForVenue(auth, venueId);
  }

  @Patch("requests/:requestId/status")
  @ApiOkResponse({ description: "Updates a support request lifecycle status" })
  updateStatus(
    @CurrentAuth() auth: AuthContext,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() input: UpdateRequestStatusDto
  ) {
    return this.requests.updateStatus(auth, requestId, input);
  }
}

@SkipThrottle({ default: true })
@ApiTags("public requests")
@Controller("public/requests")
export class PublicRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Patch(":requestId/action")
  @Throttle({ public_qr: { limit: 10, ttl: 60000 } })
  @ApiOkResponse({ description: "Applies a guest request action" })
  applyGuestAction(@Param("requestId", ParseUUIDPipe) requestId: string, @Body() input: GuestRequestActionDto) {
    return this.requests.applyGuestAction({
      requestId,
      ...input
    });
  }
}
