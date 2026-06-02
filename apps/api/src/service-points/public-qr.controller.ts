import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
import { PublicVenueMessageDto } from "./dto/public-venue-message.dto";
import { ServicePointsService } from "./service-points.service";

@SkipThrottle({ default: true })
@ApiTags("public qr")
@Controller("public/qr")
export class PublicQrController {
  constructor(private readonly servicePoints: ServicePointsService) {}

  @Get(":token")
  @Throttle({ public_qr: { limit: 30, ttl: 60000 } })
  @ApiOkResponse({ description: "Loads public QR service point details and chat availability" })
  getServicePointIntake(@Param("token") token: string) {
    return this.servicePoints.getServicePointIntake(token);
  }

  @Post(":token/messages")
  @Throttle({ public_qr: { limit: 20, ttl: 60000 } })
  @ApiCreatedResponse({ description: "Accepts a guest message from a QR service point" })
  createGuestMessage(@Param("token") token: string, @Body() input: PublicGuestMessageDto) {
    return this.servicePoints.createGuestMessage(token, input);
  }

  @Get(":token/conversations/:conversationId")
  @Throttle({ public_qr: { limit: 60, ttl: 60000 } })
  @ApiOkResponse({ description: "Loads the latest guest conversation state for a QR service point" })
  getGuestConversation(
    @Param("token") token: string,
    @Param("conversationId") conversationId: string,
    @Headers("x-guest-session") sessionId?: string
  ) {
    return this.servicePoints.getGuestConversation(token, conversationId, sessionId);
  }

  @Get("venues/:venueSlug")
  @Throttle({ public_qr: { limit: 30, ttl: 60000 } })
  @ApiOkResponse({ description: "Loads public venue intake details" })
  getVenueIntake(@Param("venueSlug") venueSlug: string) {
    return this.servicePoints.getVenueIntake(venueSlug);
  }

  @Get("venues/:venueSlug/conversations/:conversationId")
  @Throttle({ public_qr: { limit: 60, ttl: 60000 } })
  @ApiOkResponse({ description: "Loads the latest guest conversation state for a venue QR intake" })
  getVenueGuestConversation(
    @Param("venueSlug") venueSlug: string,
    @Param("conversationId") conversationId: string,
    @Headers("x-guest-session") sessionId?: string
  ) {
    return this.servicePoints.getVenueGuestConversation(venueSlug, conversationId, sessionId);
  }

  @Post("venues/:venueSlug/messages")
  @Throttle({ public_qr: { limit: 20, ttl: 60000 } })
  @ApiCreatedResponse({ description: "Accepts a guest message from a venue QR intake" })
  createVenueGuestMessage(@Param("venueSlug") venueSlug: string, @Body() input: PublicVenueMessageDto) {
    return this.servicePoints.createVenueGuestMessage(venueSlug, input);
  }
}
