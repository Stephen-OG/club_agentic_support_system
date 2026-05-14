import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DevAuthGuard } from "./dev-auth.guard";
import { SupabaseAdminService, supabaseAdminProvider } from "./supabase-admin.service";
import { SupabaseAuthGuard } from "./supabase-auth.guard";

@Module({
  imports: [DatabaseModule],
  exports: [DevAuthGuard, SupabaseAuthGuard, SupabaseAdminService, supabaseAdminProvider],
  providers: [DevAuthGuard, SupabaseAuthGuard, SupabaseAdminService, supabaseAdminProvider]
})
export class AuthModule {}
