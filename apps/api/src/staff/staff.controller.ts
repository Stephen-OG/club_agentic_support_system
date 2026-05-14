import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import type { AuthContext } from "../auth/auth-context";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import { StaffService } from "./staff.service";

@ApiTags("staff")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("me")
  @ApiOkResponse({ description: "Returns the authenticated staff profile and active memberships" })
  getCurrentUser(@CurrentAuth() auth: AuthContext) {
    return this.staff.getCurrentUser(auth);
  }

  @Get("team")
  @ApiOkResponse({ description: "Lists staff in the authenticated workspace" })
  listTeam(@CurrentAuth() auth: AuthContext) {
    return this.staff.listTeam(auth);
  }

  @Post("team")
  @ApiCreatedResponse({ description: "Creates a Supabase Auth user and staff membership" })
  createStaffUser(@CurrentAuth() auth: AuthContext, @Body() input: CreateStaffUserDto) {
    return this.staff.createStaffUser(auth, input);
  }
}
