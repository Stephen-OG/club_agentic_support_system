import type { SupabaseClient } from "@supabase/supabase-js";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export async function apiRequest<T>(supabase: SupabaseClient, path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("You are not signed in");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Request failed");
  }

  return body as T;
}
