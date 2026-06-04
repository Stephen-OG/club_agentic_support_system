import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getApiPort } from "./bootstrap-config";

describe("bootstrap config", () => {
  it("uses the platform PORT before API_PORT in production", () => {
    assert.equal(getApiPort({ NODE_ENV: "production", PORT: "5000", API_PORT: "4000" }), 5000);
  });

  it("uses API_PORT for local development", () => {
    assert.equal(getApiPort({ NODE_ENV: "development", API_PORT: "4100", PORT: "5000" }), 4100);
  });

  it("ignores generic development PORT and falls back to the local API port", () => {
    assert.equal(getApiPort({ NODE_ENV: "development", PORT: "5000" }), 4000);
  });

  it("falls back to the local API port without env", () => {
    assert.equal(getApiPort({}), 4000);
  });
});
