import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { SetupRequestDto } from "./dto/setup-request.dto";
import type { SetupResponseDto } from "./dto/setup-response.dto";
import { SetupService } from "./setup.service";

@ApiTags("setup")
@Controller("setup")
export class SetupController {
  constructor(
    private readonly setupService: SetupService,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  @Post()
  @ApiCreatedResponse({ description: "Creates workspace, owner profile, and first venue" })
  async initialize(
    @Body() input: SetupRequestDto,
    @Headers("authorization") authorization?: string
  ): Promise<SetupResponseDto> {
    // Verify the user has a valid Supabase session
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new UnauthorizedException("Missing authorization token");
    }

    const { data: { user }, error } = await this.supabaseAdmin.getClient().auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException("Invalid session");
    }

    // Ensure the email matches the authenticated user
    if (user.email?.toLowerCase() !== input.email.trim().toLowerCase()) {
      throw new UnauthorizedException("Email must match your authenticated session");
    }

    return this.setupService.initialize(input);
  }
}
