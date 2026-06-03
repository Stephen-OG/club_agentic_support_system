import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  controllers: [OnboardingController],
  imports: [AuthModule, DatabaseModule],
  providers: [OnboardingService]
})
export class OnboardingModule {}
