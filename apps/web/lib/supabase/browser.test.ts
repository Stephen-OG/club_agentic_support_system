import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const requireFromTest = createRequire(__filename);

function loadBrowserModule() {
  const modulePath = requireFromTest.resolve("./browser");
  delete requireFromTest.cache[modulePath];
  return requireFromTest("./browser") as typeof import("./browser");
}

describe("createBrowserSupabaseClient", () => {
  it("reuses one Supabase client for the browser context", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const { createBrowserSupabaseClient } = loadBrowserModule();
    const firstClient = createBrowserSupabaseClient();
    const secondClient = createBrowserSupabaseClient();

    assert.ok(firstClient);
    assert.strictEqual(secondClient, firstClient);
  });

  it("keeps the same Supabase client when the module reloads", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const firstClient = loadBrowserModule().createBrowserSupabaseClient();
    const secondClient = loadBrowserModule().createBrowserSupabaseClient();

    assert.ok(firstClient);
    assert.strictEqual(secondClient, firstClient);
  });
});
