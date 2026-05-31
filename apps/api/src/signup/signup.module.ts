import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SetupController } from "./signup.controller";
import { SetupService } from "./signup.service";

@Module({
  controllers: [SetupController],
  exports: [SetupService],
  imports: [AuthModule, DatabaseModule],
  providers: [SetupService]
})
export class SetupModule {}
