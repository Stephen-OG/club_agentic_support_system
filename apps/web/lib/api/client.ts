import type { AppAuthClient } from "@/lib/app-auth/browser";
import { createIdempotencyKey, claimIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";

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

const mutationMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isMutationMethod(method: string | undefined): boolean {
  return mutationMethods.has((method || "GET").toUpperCase());
}

function buildHeaders(initHeaders: HeadersInit | undefined, token?: string, method?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (initHeaders) {
    const entries = initHeaders instanceof Headers
      ? Array.from(initHeaders.entries())
      : Array.isArray(initHeaders)
        ? initHeaders
        : Object.entries(initHeaders);

    for (const [key, value] of entries) {
      headers[key] = value;
    }
  }

  if (isMutationMethod(method) && !headers["Idempotency-Key"]) {
    const key = createIdempotencyKey();
    claimIdempotencyKey(key);
    headers["Idempotency-Key"] = key;
  }

  return headers;
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

  const method = requestInit.method;
  const headers = buildHeaders(requestInit.headers, token, method);
  const idempotencyKey = headers["Idempotency-Key"];

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestInit,
      headers
    });
  } catch {
    if (idempotencyKey) releaseIdempotencyKey(idempotencyKey);
    throw createApiUnreachableError();
  }

  if (idempotencyKey) releaseIdempotencyKey(idempotencyKey);
  return parseResponse<T>(response);
}

export async function publicApiRequest<T>(path: string, init: RequestInit = {}) {
  const method = init.method;
  const headers = buildHeaders(init.headers, undefined, method);
  const idempotencyKey = headers["Idempotency-Key"];

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers
    });
  } catch {
    if (idempotencyKey) releaseIdempotencyKey(idempotencyKey);
    throw createApiUnreachableError();
  }

  if (idempotencyKey) releaseIdempotencyKey(idempotencyKey);
  return parseResponse<T>(response);
}
