import { Module } from "@nestjs/common";
import { TriageModule } from "../triage/triage.module";
import { PublicQrController } from "./public-qr.controller";
import { ServicePointsService } from "./service-points.service";

@Module({
  controllers: [PublicQrController],
  imports: [TriageModule],
  providers: [ServicePointsService]
})
export class ServicePointsModule {}
