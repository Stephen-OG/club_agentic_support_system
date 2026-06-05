"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type BrowserSupabaseRegistry = {
  client: SupabaseClient | null;
  config: string | null;
};

const registryKey = "__madupeBrowserSupabase";

function getRegistry() {
  const globalScope = globalThis as typeof globalThis & {
    [registryKey]?: BrowserSupabaseRegistry;
  };

  globalScope[registryKey] ??= {
    client: null,
    config: null
  };

  return globalScope[registryKey];
}

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const configKey = `${url}:${anonKey}`;
  const registry = getRegistry();

  if (registry.client && registry.config === configKey) {
    return registry.client;
  }

  registry.client = createClient(url, anonKey);
  registry.config = configKey;

  return registry.client;
}
