import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { OnboardingService } from "./onboarding.service";

@ApiTags("onboarding")
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("status")
  @ApiOkResponse({ description: "Returns the derived workspace launch checklist status" })
  getStatus(@CurrentAuth() auth: AuthContext) {
    return this.onboarding.getStatus(auth);
  }
}
