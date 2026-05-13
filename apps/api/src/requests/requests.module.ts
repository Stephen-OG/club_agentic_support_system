import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { VenuesModule } from "../venues/venues.module";
import { PublicRequestsController, RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

@Module({
  controllers: [RequestsController, PublicRequestsController],
  exports: [RequestsService],
  imports: [AuthModule, DatabaseModule, VenuesModule],
  providers: [RequestsService]
})
export class RequestsModule {}
