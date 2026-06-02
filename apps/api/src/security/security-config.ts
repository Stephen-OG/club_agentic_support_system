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

const localOrigins = ["http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://localhost:3000", "http://localhost:3001"];

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

export function assertProductionSecurityConfig(env: EnvMap = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (!env.MESSAGE_ENCRYPTION_KEY?.trim()) {
    throw new Error("MESSAGE_ENCRYPTION_KEY is required in production");
  }

  if (!env.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL is required in production for shared rate limits, cache, and background jobs");
  }
}

export function applySecurityHeaders(app: INestApplication) {
  app.use((_: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    for (const [name, value] of Object.entries(defaultSecurityHeaders)) {
      response.setHeader(name, value);
    }
    next();
  });
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
