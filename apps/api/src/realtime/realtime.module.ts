import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { VenuesModule } from "../venues/venues.module";
import { DomainEventsService } from "./domain-events.service";
import { RealtimeController } from "./realtime.controller";

@Module({
  controllers: [RealtimeController],
  exports: [DomainEventsService],
  imports: [AuthModule, DatabaseModule, VenuesModule],
  providers: [DomainEventsService]
})
export class RealtimeModule {}
