import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";

const requireFromTest = createRequire(__filename);
const originalFetch = globalThis.fetch;

function installWindowStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
        clear: () => values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
          return values.size;
        }
      }
    }
  });

  return values;
}

function loadBrowserModule() {
  const modulePath = requireFromTest.resolve("./browser");
  delete requireFromTest.cache[modulePath];
  return requireFromTest("./browser") as typeof import("./browser");
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
  delete (globalThis as typeof globalThis & { __madupeBrowserAuth?: unknown }).__madupeBrowserAuth;
});

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

  it("replaces stored tokens with the fresh password-change session", async () => {
    const storage = installWindowStorage();
    const { createBrowserAuthClient } = loadBrowserModule();
    const storedSession = {
      access_token: "old-access-token",
      refresh_token: "old-refresh-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 600_000).toISOString(),
      user: {
        id: "auth-1",
        email: "sam@example.com",
        email_confirmed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        user_metadata: {
          displayName: "Sam",
          mustChangePassword: true
        }
      }
    };
    const freshSession = {
      ...storedSession,
      access_token: "fresh-access-token",
      refresh_token: "fresh-refresh-token",
      user: {
        ...storedSession.user,
        user_metadata: {
          ...storedSession.user.user_metadata,
          mustChangePassword: false
        }
      }
    };
    storage.set("madupe.auth.session", JSON.stringify(storedSession));

    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://127.0.0.1:4000/auth/password");
      assert.deepEqual(init?.headers, {
        Authorization: "Bearer old-access-token",
        "Content-Type": "application/json"
      });
      return new Response(JSON.stringify(freshSession), { status: 200 });
    };

    const client = createBrowserAuthClient();
    const result = await client.auth.updatePassword({ oldPassword: "old-password", password: "new-secure-password" });
    const nextSession = JSON.parse(storage.get("madupe.auth.session") ?? "{}");

    assert.equal(result.error, null);
    assert.equal(nextSession.access_token, "fresh-access-token");
    assert.equal(nextSession.refresh_token, "fresh-refresh-token");
    assert.equal(nextSession.user.user_metadata.mustChangePassword, false);
  });

  it("requests an unverified signup email change", async () => {
    const { createBrowserAuthClient } = loadBrowserModule();

    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://127.0.0.1:4000/auth/signup/email");
      assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
      assert.deepEqual(JSON.parse(String(init?.body)), {
        currentEmail: "wrong@example.com",
        newEmail: "right@example.com",
        password: "signup-password"
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const client = createBrowserAuthClient();
    const result = await client.auth.changeUnverifiedEmail({
      currentEmail: "wrong@example.com",
      newEmail: "right@example.com",
      password: "signup-password"
    });

    assert.equal(result.error, null);
  });

  it("verifies an email address with an OTP code", async () => {
    const { createBrowserAuthClient } = loadBrowserModule();

    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://127.0.0.1:4000/auth/verify-email");
      assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
      assert.deepEqual(JSON.parse(String(init?.body)), {
        email: "alex@example.com",
        code: "123456"
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const client = createBrowserAuthClient();
    const result = await client.auth.verifyEmailCode({
      email: "alex@example.com",
      code: "123456"
    });

    assert.equal(result.error, null);
  });

  it("resets a password with an OTP code", async () => {
    const storage = installWindowStorage();
    const { createBrowserAuthClient } = loadBrowserModule();
    const freshSession = {
      access_token: "reset-access-token",
      refresh_token: "reset-refresh-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 600_000).toISOString(),
      user: {
        id: "auth-1",
        email: "alex@example.com",
        email_confirmed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        user_metadata: {
          displayName: "Alex",
          mustChangePassword: false
        }
      }
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://127.0.0.1:4000/auth/password-reset/confirm");
      assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
      assert.deepEqual(JSON.parse(String(init?.body)), {
        email: "alex@example.com",
        code: "654321",
        password: "new-secure-password"
      });
      return new Response(JSON.stringify(freshSession), { status: 200 });
    };

    const client = createBrowserAuthClient();
    const result = await client.auth.resetPassword({
      email: "alex@example.com",
      code: "654321",
      password: "new-secure-password"
    });
    const storedSession = JSON.parse(storage.get("madupe.auth.session") ?? "{}");

    assert.equal(result.error, null);
    assert.equal(result.data.session?.access_token, "reset-access-token");
    assert.equal(storedSession.access_token, "reset-access-token");
  });
});
