import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getApiPort } from "./bootstrap-config";

describe("bootstrap config", () => {
  it("uses the platform PORT before API_PORT", () => {
    assert.equal(getApiPort({ PORT: "4000", API_PORT: "4001" }), 4000);
  });

  it("uses API_PORT when no platform PORT is set", () => {
    assert.equal(getApiPort({ API_PORT: "4100" }), 4100);
  });

  it("falls back to the local API port", () => {
    assert.equal(getApiPort({}), 4001);
  });
});
