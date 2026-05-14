import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export type SupabaseAdminClient = SupabaseClient;
export const SUPABASE_ADMIN_CLIENT = Symbol("SUPABASE_ADMIN_CLIENT");

export const supabaseAdminProvider = {
  provide: SUPABASE_ADMIN_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const url = config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = config.get<string>("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      throw new InternalServerErrorException("Supabase admin configuration is missing");
    }

    return createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      realtime: {
        transport: WebSocket as unknown as WebSocketLikeConstructor
      }
    });
  }
};

@Injectable()
export class SupabaseAdminService {
  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseAdminClient) {}

  async createTemporaryPasswordUser(input: { email: string; password: string; displayName: string }) {
    const result = await this.supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        displayName: input.displayName,
        mustChangePassword: true
      }
    });

    if (result.error || !result.data.user) {
      throw new InternalServerErrorException(result.error?.message || "Could not create auth user");
    }

    return result.data.user;
  }

  async clearPasswordChangeRequired(authUserId: string) {
    const result = await this.supabase.auth.admin.updateUserById(authUserId, {
      user_metadata: {
        mustChangePassword: false
      }
    });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.data.user;
  }
}
