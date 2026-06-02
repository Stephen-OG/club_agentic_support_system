import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProductionSecurityConfig,
  defaultSecurityHeaders,
  getApiHost,
  getRateLimitConfig,
  isCorsOriginAllowed,
  parseCorsOrigins,
  shouldExposeApiDocs
} from "./security-config";

describe("security config", () => {
  it("parses comma-separated CORS origins and keeps safe local defaults", () => {
    assert.deepEqual(parseCorsOrigins(" https://app.example.com,https://admin.example.com "), [
      "https://app.example.com",
      "https://admin.example.com"
    ]);
    assert.equal(parseCorsOrigins(undefined).includes("http://127.0.0.1:3001"), true);
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

  it("sets basic SaaS hardening headers", () => {
    assert.equal(defaultSecurityHeaders["X-Content-Type-Options"], "nosniff");
    assert.equal(defaultSecurityHeaders["X-Frame-Options"], "DENY");
    assert.match(defaultSecurityHeaders["Permissions-Policy"], /camera=\(\)/);
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

  it("requires message encryption configuration in production", () => {
    assert.doesNotThrow(() => assertProductionSecurityConfig({ NODE_ENV: "development" }));
    assert.throws(() => assertProductionSecurityConfig({ NODE_ENV: "production" }), /MESSAGE_ENCRYPTION_KEY/);
    assert.throws(
      () => assertProductionSecurityConfig({ NODE_ENV: "production", MESSAGE_ENCRYPTION_KEY: "01234567890123456789012345678901" }),
      /REDIS_URL/
    );
    assert.doesNotThrow(() =>
      assertProductionSecurityConfig({
        NODE_ENV: "production",
        MESSAGE_ENCRYPTION_KEY: "01234567890123456789012345678901",
        REDIS_URL: "redis://localhost:6379"
      })
    );
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
