import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { LaunchService } from "./launch.service";

@ApiTags("launch")
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller("launch")
export class LaunchController {
  constructor(private readonly launch: LaunchService) {}

  @Get("status")
  @ApiOkResponse({ description: "Returns the derived organization launch checklist status" })
  getStatus(@CurrentAuth() auth: AuthContext) {
    return this.launch.getStatus(auth);
  }
}
