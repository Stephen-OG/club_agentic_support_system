import type { AppAuthClient } from "@/lib/app-auth/browser";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

type ApiErrorBody = {
  error?: string;
  message?: string;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

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
    throw new ApiRequestError(body?.message || body?.error || "Request failed", response.status);
  }

  return body as T;
}

export function createApiUnreachableError() {
  return new Error(`API server is unreachable at ${apiBaseUrl}. Start it with npm run dev:api or set NEXT_PUBLIC_API_URL.`);
}

export async function getValidAccessToken(authClient: AppAuthClient, explicitAccessToken?: string) {
  if (explicitAccessToken) {
    return explicitAccessToken;
  }

  return (await authClient.auth.getSession()).data.session?.access_token ?? null;
}

export async function apiRequest<T>(authClient: AppAuthClient, path: string, init: ApiRequestInit = {}) {
  const token = await getValidAccessToken(authClient, init.accessToken);

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
