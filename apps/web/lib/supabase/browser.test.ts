import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBrowserSupabaseClient } from "./browser";

describe("createBrowserSupabaseClient", () => {
  it("reuses one Supabase client for the browser context", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const firstClient = createBrowserSupabaseClient();
    const secondClient = createBrowserSupabaseClient();

    assert.ok(firstClient);
    assert.strictEqual(secondClient, firstClient);
  });
});
