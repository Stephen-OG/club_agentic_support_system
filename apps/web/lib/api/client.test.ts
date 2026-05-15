import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { apiRequest, publicApiRequest } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiRequest", () => {
  it("explains when the production API cannot be reached", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    const supabase = {
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

    await assert.rejects(() => apiRequest(supabase as unknown as Parameters<typeof apiRequest>[0], "/team"), /API server is unreachable/);
  });
});

describe("publicApiRequest", () => {
  it("does not require a Supabase session for public QR endpoints", async () => {
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
