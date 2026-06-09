import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { MenuModule } from "../menu/menu.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { TriageModule } from "../triage/triage.module";
import { VenuesModule } from "../venues/venues.module";
import { AdminVenuesController } from "./admin-venues.controller";
import { PublicQrController } from "./public-qr.controller";
import { ServicePointsService } from "./service-points.service";

@Module({
  controllers: [PublicQrController, AdminVenuesController],
  exports: [ServicePointsService],
  imports: [AuthModule, JobsModule, MenuModule, RealtimeModule, TriageModule, VenuesModule],
  providers: [ServicePointsService]
})
export class ServicePointsModule {}
