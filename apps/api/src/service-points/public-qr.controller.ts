import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
import { ServicePointsService } from "./service-points.service";

@ApiTags("public qr")
@Controller("public/qr")
export class PublicQrController {
  constructor(private readonly servicePoints: ServicePointsService) {}

  @Post(":token/messages")
  @ApiCreatedResponse({ description: "Accepts a guest message from a QR service point" })
  createGuestMessage(@Param("token") token: string, @Body() input: PublicGuestMessageDto) {
    return this.servicePoints.createGuestMessage(token, input);
  }

  @Get(":token/conversations/:conversationId")
  @ApiOkResponse({ description: "Loads the latest guest conversation state for a QR service point" })
  getGuestConversation(@Param("token") token: string, @Param("conversationId") conversationId: string) {
    return this.servicePoints.getGuestConversation(token, conversationId);
  }
}
