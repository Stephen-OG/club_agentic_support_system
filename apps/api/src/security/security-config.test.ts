import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProductionSecurityConfig,
  defaultSecurityHeaders,
  getSecurityHeaders,
  getApiHost,
  getRateLimitConfig,
  isCorsOriginAllowed,
  parseCorsOrigins,
  shouldExposeApiDocs,
  shouldUseRedisRateLimits
} from "./security-config";

describe("security config", () => {
  it("parses comma-separated CORS origins and keeps safe local defaults", () => {
    assert.deepEqual(parseCorsOrigins(" https://app.example.com,https://admin.example.com "), [
      "https://app.example.com",
      "https://admin.example.com"
    ]);
    assert.equal(parseCorsOrigins(undefined).includes("http://127.0.0.1:3001"), true);
    assert.equal(parseCorsOrigins(undefined).includes("http://127.0.0.1:3002"), true);
  });

  it("allows same-origin server calls and rejects origins outside the allow-list", () => {
    const allowed = ["https://app.example.com"];

    assert.equal(isCorsOriginAllowed(undefined, allowed), true);
    assert.equal(isCorsOriginAllowed("https://app.example.com", allowed), true);
    assert.equal(isCorsOriginAllowed("https://evil.example.com", allowed), false);
  });

  it("uses bounded default API rate limits with env overrides", () => {
    const defaults: any = getRateLimitConfig({});
    assert.equal(defaults.throttlers.length, 2);
    assert.equal(defaults.throttlers[0].name, "default");
    assert.equal(defaults.throttlers[0].ttl, 60000);
    assert.equal(defaults.throttlers[0].limit, 60);
    assert.equal(defaults.throttlers[1].name, "public_qr");
    assert.equal(defaults.throttlers[1].limit, 20);
    assert.equal(defaults.throttlers[1].skipIf(createHttpContext("/admin/venues")), true);
    assert.equal(defaults.throttlers[1].skipIf(createHttpContext("/public/qr/table-1/messages")), false);
    assert.equal(defaults.throttlers[1].skipIf(createHttpContext("/public/requests/request-1/action")), false);

    const overridden: any = getRateLimitConfig({ API_RATE_LIMIT_TTL_MS: "30000", API_RATE_LIMIT_MAX: "25" });
    assert.equal(overridden.throttlers[0].ttl, 30000);
    assert.equal(overridden.throttlers[0].limit, 25);
    assert.equal(overridden.throttlers[1].limit, 20);

    const bounded: any = getRateLimitConfig({ API_RATE_LIMIT_TTL_MS: "-1", API_RATE_LIMIT_MAX: "0" });
    assert.equal(bounded.throttlers[0].ttl, 60000);
    assert.equal(bounded.throttlers[0].limit, 60);
  });

  it("uses Redis rate limits only in production or when explicitly enabled", () => {
    assert.equal(shouldUseRedisRateLimits({ NODE_ENV: "development", REDIS_URL: "redis://localhost:6379" }), false);
    assert.equal(
      shouldUseRedisRateLimits({
        NODE_ENV: "development",
        REDIS_URL: "redis://localhost:6379",
        ENABLE_REDIS_RATE_LIMITS: "true"
      }),
      true
    );
    assert.equal(shouldUseRedisRateLimits({ NODE_ENV: "production", REDIS_URL: "redis://localhost:6379" }), true);
  });

  it("sets basic SaaS hardening headers", () => {
    assert.equal(defaultSecurityHeaders["X-Content-Type-Options"], "nosniff");
    assert.equal(defaultSecurityHeaders["X-Frame-Options"], "DENY");
    assert.match(defaultSecurityHeaders["Permissions-Policy"], /camera=\(\)/);
  });

  it("adds strict browser security headers in production", () => {
    const headers = getSecurityHeaders({ NODE_ENV: "production" });

    assert.equal(headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
    const csp = headers["Content-Security-Policy"];
    assert.equal(typeof csp, "string");
    assert.match(csp || "", /default-src 'none'/);
    assert.match(csp || "", /frame-ancestors 'none'/);
  });

  it("keeps API docs usable outside production by not applying production CSP", () => {
    const headers = getSecurityHeaders({ NODE_ENV: "development" });

    assert.equal(headers["Content-Security-Policy"], undefined);
    assert.equal(headers["Strict-Transport-Security"], undefined);
  });

  it("hides API docs in production unless explicitly enabled", () => {
    assert.equal(shouldExposeApiDocs({ NODE_ENV: "production" }), false);
    assert.equal(shouldExposeApiDocs({ NODE_ENV: "production", ENABLE_API_DOCS: "true" }), true);
    assert.equal(shouldExposeApiDocs({ NODE_ENV: "development" }), true);
  });

  it("binds API to all interfaces by default in production hosting", () => {
    assert.equal(getApiHost({ NODE_ENV: "development" }), "127.0.0.1");
    assert.equal(getApiHost({ NODE_ENV: "production" }), "0.0.0.0");
    assert.equal(getApiHost({ NODE_ENV: "production", HOST: "127.0.0.1" }), "127.0.0.1");
  });

  it("requires launch-critical production configuration", () => {
    assert.doesNotThrow(() => assertProductionSecurityConfig({ NODE_ENV: "development" }));
    assert.throws(() => assertProductionSecurityConfig({ NODE_ENV: "production" }), /DATABASE_URL/);
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          ...validProductionEnv(),
          NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321"
        }),
      /SUPABASE_URL.*HTTPS/
    );
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          ...validProductionEnv(),
          MESSAGE_ENCRYPTION_KEY: "not-a-32-byte-key"
        }),
      /32 bytes/
    );
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          ...validProductionEnv(),
          REDIS_URL: ""
        }),
      /REDIS_URL/
    );
    assert.throws(
      () =>
        assertProductionSecurityConfig({
          ...validProductionEnv(),
          CORS_ORIGINS: "http://localhost:3001"
        }),
      /public HTTPS/
    );
    assert.doesNotThrow(() => assertProductionSecurityConfig(validProductionEnv()));
  });
});

function createHttpContext(path: string) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return { path };
        }
      };
    }
  } as never;
}

function validProductionEnv() {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:postgres@db.example.com:5432/postgres",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    OPENAI_API_KEY: "openai-key",
    MESSAGE_ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
    REDIS_URL: "rediss://default:secret@redis.example.com:6379",
    CORS_ORIGINS: "https://app.example.com"
  };
}
