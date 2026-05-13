import { Module } from "@nestjs/common";
import { VenueAccessService } from "./access.service";

@Module({
  exports: [VenueAccessService],
  providers: [VenueAccessService]
})
export class VenuesModule {}
