import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VenuesModule } from "../venues/venues.module";
import { MenuAssistantService } from "./menu-assistant.service";
import { MenuController } from "./menu.controller";
import { MenuService } from "./menu.service";

@Module({
  controllers: [MenuController],
  exports: [MenuAssistantService, MenuService],
  imports: [AuthModule, VenuesModule],
  providers: [MenuAssistantService, MenuService]
})
export class MenuModule {}
