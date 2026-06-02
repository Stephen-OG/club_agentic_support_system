import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { TriageModule } from "../triage/triage.module";
import { VenuesModule } from "../venues/venues.module";
import { AdminVenuesController } from "./admin-venues.controller";
import { PublicQrController } from "./public-qr.controller";
import { ServicePointsService } from "./service-points.service";

@Module({
  controllers: [PublicQrController, AdminVenuesController],
  exports: [ServicePointsService],
  imports: [AuthModule, JobsModule, TriageModule, VenuesModule],
  providers: [ServicePointsService]
})
export class ServicePointsModule {}
