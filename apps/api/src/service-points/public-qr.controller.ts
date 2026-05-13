import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
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
}
