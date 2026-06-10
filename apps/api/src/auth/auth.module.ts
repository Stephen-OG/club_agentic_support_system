import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MailModule } from "../mail/mail.module";
import { AppAuthService } from "./app-auth.service";
import { AuthController } from "./auth.controller";
import { DevAuthGuard } from "./dev-auth.guard";
import { SessionAuthGuard } from "./session-auth.guard";

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [AuthController],
  exports: [AppAuthService, DevAuthGuard, SessionAuthGuard, MailModule],
  providers: [AppAuthService, DevAuthGuard, SessionAuthGuard]
})
export class AuthModule {}
