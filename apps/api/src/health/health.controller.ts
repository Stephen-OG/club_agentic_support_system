import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ description: "API health check" })
  getHealth() {
    return {
      service: "guestos-api",
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }
}
