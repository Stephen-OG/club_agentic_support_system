import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { AppAuthService } from "../auth/app-auth.service";
import { SetupRequestDto } from "./dto/signup-request.dto";
import type { SetupResponseDto } from "./dto/signup-response.dto";
import { SetupService } from "./signup.service";

@ApiTags("signup")
@Controller("signup")
export class SetupController {
  constructor(
    private readonly signupService: SetupService,
    private readonly appAuth: AppAuthService
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiCreatedResponse({ description: "Creates workspace, owner profile, and first venue" })
  async initialize(
    @Body() input: SetupRequestDto,
    @Headers("authorization") authorization?: string
  ): Promise<SetupResponseDto> {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new UnauthorizedException("Missing authorization token");
    }

    const { user } = await this.appAuth.verifyBearerToken(token);

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Email must be verified before workspace setup");
    }

    if (user.email?.toLowerCase() !== input.email.trim().toLowerCase()) {
      throw new UnauthorizedException("Email must match your authenticated session");
    }

    return this.signupService.initialize(input, user.id);
  }
}
