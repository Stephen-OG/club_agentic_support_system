import type { INestApplication } from "@nestjs/common";

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

export function getRateLimitConfig(env: EnvMap = process.env) {
  return [
    {
      ttl: positiveInteger(env.API_RATE_LIMIT_TTL_MS, 60000),
      limit: positiveInteger(env.API_RATE_LIMIT_MAX, 60)
    }
  ];
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
