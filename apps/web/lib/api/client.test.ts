import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiRequestError, apiRequest, getValidAccessToken, publicApiRequest } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiRequest", () => {
  it("resolves protected request tokens through the refresh-aware auth session", async () => {
    let getSessionCalls = 0;
    const authClient = {
      auth: {
        getSession: async () => {
          getSessionCalls++;
          return {
            data: {
              session: {
                access_token: "fresh-token"
              }
            }
          };
        }
      }
    };

    assert.equal(await getValidAccessToken(authClient as unknown as Parameters<typeof getValidAccessToken>[0]), "fresh-token");
    assert.equal(getSessionCalls, 1);
  });

  it("uses explicit access tokens without refreshing the stored session", async () => {
    let getSessionCalls = 0;
    const authClient = {
      auth: {
        getSession: async () => {
          getSessionCalls++;
          return { data: { session: { access_token: "stored-token" } } };
        }
      }
    };

    assert.equal(await getValidAccessToken(authClient as unknown as Parameters<typeof getValidAccessToken>[0], "explicit-token"), "explicit-token");
    assert.equal(getSessionCalls, 0);
  });

  it("explains when the production API cannot be reached", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    const authClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: "token"
            }
          }
        })
      }
    };

    await assert.rejects(() => apiRequest(authClient as unknown as Parameters<typeof apiRequest>[0], "/team"), /API server is unreachable/);
  });

  it("preserves HTTP status on failed API responses", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "Staff account is not configured" }), { status: 401 });

    const authClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: "token"
            }
          }
        })
      }
    };

    await assert.rejects(
      () => apiRequest(authClient as unknown as Parameters<typeof apiRequest>[0], "/me"),
      (error) => error instanceof ApiRequestError && error.status === 401 && error.message === "Staff account is not configured"
    );
  });
});

describe("publicApiRequest", () => {
  it("does not require an app auth session for public QR endpoints", async () => {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://127.0.0.1:4000/public/qr/token/messages");
      assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await publicApiRequest<{ ok: boolean }>("/public/qr/token/messages");

    assert.deepEqual(result, { ok: true });
  });

  it("explains when the public API cannot be reached", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    await assert.rejects(() => publicApiRequest("/public/qr/token/messages"), /API server is unreachable/);
  });
});
