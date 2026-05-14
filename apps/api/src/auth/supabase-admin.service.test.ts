import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { supabaseAdminProvider } from "./supabase-admin.service";

describe("supabaseAdminProvider", () => {
  it("constructs the Supabase admin client in the Node API runtime", () => {
    const config = {
      get: (key: string) => {
        if (key === "NEXT_PUBLIC_SUPABASE_URL") {
          return "https://example.supabase.co";
        }

        if (key === "SUPABASE_SERVICE_ROLE_KEY") {
          return "service-role-key";
        }

        return undefined;
      }
    };

    assert.doesNotThrow(() => supabaseAdminProvider.useFactory(config as any));
  });
});
