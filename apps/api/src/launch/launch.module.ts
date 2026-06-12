import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { LaunchController } from "./launch.controller";
import { LaunchService } from "./launch.service";

@Module({
  controllers: [LaunchController],
  imports: [AuthModule, DatabaseModule],
  providers: [LaunchService]
})
export class LaunchModule {}
