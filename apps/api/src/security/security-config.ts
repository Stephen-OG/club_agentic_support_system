import type { ExecutionContext, INestApplication } from "@nestjs/common";
import type { ThrottlerModuleOptions } from "@nestjs/throttler";
import { RedisThrottlerStorage } from "./redis-throttler-storage";

type EnvMap = Record<string, string | undefined>;

export const defaultSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
} as const;

const productionSecurityHeaders = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
} as const;

const localOrigins = [
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002"
];

export function parseCorsOrigins(value: string | undefined) {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins?.length ? origins : localOrigins;
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]) {
  return !origin || allowedOrigins.includes(origin);
}

export function getRateLimitConfig(env: EnvMap = process.env): ThrottlerModuleOptions {
  const ttl = positiveInteger(env.API_RATE_LIMIT_TTL_MS, 60000);
  const limit = positiveInteger(env.API_RATE_LIMIT_MAX, 60);
  const publicQrLimit = positiveInteger(env.PUBLIC_QR_RATE_LIMIT_MAX, 20);
  const redisUrl = env.REDIS_URL;

  const throttlers = [
    {
      name: "default",
      ttl,
      limit
    },
    {
      name: "public_qr",
      ttl,
      limit: publicQrLimit,
      skipIf: (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest() as { path?: string; url?: string };
        const path = request.path || request.url || "";
        return !path.startsWith("/public/qr") && !path.startsWith("/public/requests");
      }
    }
  ];

  if (redisUrl && shouldUseRedisRateLimits(env)) {
    return {
      throttlers,
      storage: new RedisThrottlerStorage()
    };
  }

  return { throttlers };
}

export function shouldExposeApiDocs(env: EnvMap = process.env) {
  return env.NODE_ENV !== "production" || env.ENABLE_API_DOCS === "true";
}

export function shouldUseRedisRateLimits(env: EnvMap = process.env) {
  if (env.DISABLE_REDIS_RATE_LIMITS === "true") {
    return false;
  }

  if (env.NODE_ENV === "production") {
    return true;
  }

  return env.ENABLE_REDIS_RATE_LIMITS === "true";
}

export function getApiHost(env: EnvMap = process.env) {
  return env.HOST || (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
}

export function getPublicAppBaseUrl(env: EnvMap = process.env) {
  return getConfiguredBaseUrl(
    env,
    ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_WEB_URL", "APP_URL"],
    "http://127.0.0.1:3001",
    "NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_WEB_URL, APP_URL, or CORS_ORIGINS",
    firstCorsOrigin(env.CORS_ORIGINS)
  );
}

export function getPublicApiBaseUrl(env: EnvMap = process.env) {
  return getConfiguredBaseUrl(
    env,
    ["PUBLIC_API_URL", "NEXT_PUBLIC_API_URL", "RENDER_EXTERNAL_URL"],
    "http://127.0.0.1:4000",
    "PUBLIC_API_URL, NEXT_PUBLIC_API_URL, or RENDER_EXTERNAL_URL"
  );
}

export function assertProductionSecurityConfig(env: EnvMap = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  assertRequiredProductionEnv(env, "DATABASE_URL");
  assertRequiredProductionEnv(env, "OPENAI_API_KEY");
  assertRequiredProductionEnv(env, "MESSAGE_ENCRYPTION_KEY");
  assertRequiredProductionEnv(env, "AUTH_JWT_SECRET");
  assertRequiredProductionEnv(env, "SMTP_USER", "SMTP_USER is required in production for Google SMTP authentication");
  assertRequiredProductionEnv(env, "SMTP_PASSWORD", "SMTP_PASSWORD is required in production for Google SMTP authentication");
  assertRequiredProductionEnv(env, "MAIL_FROM");
  getPublicAppBaseUrl(env);
  getPublicApiBaseUrl(env);
  assertValidMessageEncryptionKey(env.MESSAGE_ENCRYPTION_KEY || "");
  assertRequiredProductionEnv(env, "REDIS_URL", "REDIS_URL is required in production for shared rate limits, cache, and background jobs");
  assertRequiredProductionEnv(env, "CORS_ORIGINS");

  const origins = parseCorsOrigins(env.CORS_ORIGINS);
  for (const origin of origins) {
    assertPublicHttpsUrl(origin, "CORS_ORIGINS");
  }
}

export function getSecurityHeaders(env: EnvMap = process.env) {
  return {
    ...defaultSecurityHeaders,
    ...(env.NODE_ENV === "production" ? productionSecurityHeaders : {})
  };
}

export function applySecurityHeaders(app: INestApplication, env: EnvMap = process.env) {
  const headers = getSecurityHeaders(env);

  app.use((_: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
    next();
  });
}

function getConfiguredBaseUrl(env: EnvMap, names: string[], localFallback: string, label: string, fallbackValue?: string) {
  const configured = names.map((name) => env[name]?.trim()).find(Boolean) || fallbackValue;

  if (!configured) {
    if (env.NODE_ENV === "production") {
      throw new Error(`${label} is required in production`);
    }
    return localFallback;
  }

  if (env.NODE_ENV === "production") {
    assertPublicHttpsUrl(configured, label);
  }

  return configured;
}

function firstCorsOrigin(value: string | undefined) {
  return value
    ?.split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
}

function assertPublicHttpsUrl(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid public HTTPS URL in production`);
  }

  if (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname)) {
    throw new Error(`${label} must be a public HTTPS URL in production`);
  }
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0" || normalized === "::1";
}

function assertRequiredProductionEnv(env: EnvMap, name: string, message = `${name} is required in production`) {
  if (!env[name]?.trim()) {
    throw new Error(message);
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertValidMessageEncryptionKey(value: string) {
  const trimmed = value.trim();
  const decoded = /^[a-f0-9]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");

  if (decoded.length !== 32) {
    throw new Error("MESSAGE_ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM");
  }
}
