import type { AppAuthClient } from "@/lib/app-auth/browser";
import { getCachedAuthSession } from "@/lib/app-auth/use-session";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

type ApiErrorBody = {
  error?: string;
  message?: string;
};

export type ApiRequestInit = RequestInit & {
  accessToken?: string;
};

function buildHeaders(initHeaders: HeadersInit | undefined, token?: string) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(initHeaders || {})
  };
}

async function parseResponse<T>(response: Response) {
  const body = (await response.json().catch(() => null)) as (ApiErrorBody & T) | null;

  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Request failed");
  }

  return body as T;
}

export function createApiUnreachableError() {
  return new Error(`API server is unreachable at ${apiBaseUrl}. Start it with npm run dev:api or set NEXT_PUBLIC_API_URL.`);
}

export async function apiRequest<T>(authClient: AppAuthClient, path: string, init: ApiRequestInit = {}) {
  const cachedSession = getCachedAuthSession();
  const token = init.accessToken ?? cachedSession?.access_token ?? (await authClient.auth.getSession()).data.session?.access_token;

  if (!token) {
    throw new Error("You are not signed in");
  }

  const requestInit = { ...init };
  delete requestInit.accessToken;

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestInit,
      headers: buildHeaders(requestInit.headers, token)
    });
  } catch {
    throw createApiUnreachableError();
  }

  return parseResponse<T>(response);
}

export async function publicApiRequest<T>(path: string, init: RequestInit = {}) {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(init.headers)
    });
  } catch {
    throw createApiUnreachableError();
  }

  return parseResponse<T>(response);
}
