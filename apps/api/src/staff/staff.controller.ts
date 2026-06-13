import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import type { AuthContext } from "../auth/auth-context";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { Idempotent } from "../common/idempotency/idempotent.decorator";
import { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import { StaffService } from "./staff.service";

@ApiTags("staff")
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("me")
  @ApiOkResponse({ description: "Returns the authenticated staff profile and active memberships" })
  getCurrentUser(@CurrentAuth() auth: AuthContext) {
    return this.staff.getCurrentUser(auth);
  }

  @Get("team")
  @ApiOkResponse({ description: "Lists staff in the authenticated organization" })
  listTeam(@CurrentAuth() auth: AuthContext) {
    return this.staff.listTeam(auth);
  }

  @Post("team")
  @Idempotent()
  @ApiCreatedResponse({ description: "Creates an app auth user and staff membership" })
  createStaffUser(@CurrentAuth() auth: AuthContext, @Body() input: CreateStaffUserDto) {
    return this.staff.createStaffUser(auth, input);
  }
}
