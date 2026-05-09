import { Module } from "@nestjs/common";
import { DevAuthGuard } from "./dev-auth.guard";

@Module({
  exports: [DevAuthGuard],
  providers: [DevAuthGuard]
})
export class AuthModule {}
