"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserSupabaseClient: SupabaseClient | null = null;
let browserSupabaseConfig: string | null = null;

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const configKey = `${url}:${anonKey}`;

  if (browserSupabaseClient && browserSupabaseConfig === configKey) {
    return browserSupabaseClient;
  }

  browserSupabaseClient = createClient(url, anonKey);
  browserSupabaseConfig = configKey;

  return browserSupabaseClient;
}
