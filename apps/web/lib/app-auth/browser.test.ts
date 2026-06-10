import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const requireFromTest = createRequire(__filename);

function loadBrowserModule() {
  const modulePath = requireFromTest.resolve("./browser");
  delete requireFromTest.cache[modulePath];
  return requireFromTest("./browser") as typeof import("./browser");
}

describe("createBrowserAuthClient", () => {
  it("reuses one app auth client for the browser context", () => {
    const { createBrowserAuthClient } = loadBrowserModule();
    const firstClient = createBrowserAuthClient();
    const secondClient = createBrowserAuthClient();

    assert.ok(firstClient);
    assert.strictEqual(secondClient, firstClient);
  });

  it("keeps the same app auth client when the module reloads", () => {
    const firstClient = loadBrowserModule().createBrowserAuthClient();
    const secondClient = loadBrowserModule().createBrowserAuthClient();

    assert.ok(firstClient);
    assert.strictEqual(secondClient, firstClient);
  });
});
