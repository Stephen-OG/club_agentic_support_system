import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSecurityHeaders, getRateLimitConfig, isCorsOriginAllowed, parseCorsOrigins } from "./security-config";

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
    assert.deepEqual(getRateLimitConfig({}), [{ ttl: 60000, limit: 60 }]);
    assert.deepEqual(getRateLimitConfig({ API_RATE_LIMIT_TTL_MS: "30000", API_RATE_LIMIT_MAX: "25" }), [
      { ttl: 30000, limit: 25 }
    ]);
    assert.deepEqual(getRateLimitConfig({ API_RATE_LIMIT_TTL_MS: "-1", API_RATE_LIMIT_MAX: "0" }), [
      { ttl: 60000, limit: 60 }
    ]);
  });

  it("sets basic SaaS hardening headers", () => {
    assert.equal(defaultSecurityHeaders["X-Content-Type-Options"], "nosniff");
    assert.equal(defaultSecurityHeaders["X-Frame-Options"], "DENY");
    assert.match(defaultSecurityHeaders["Permissions-Policy"], /camera=\(\)/);
  });
});
