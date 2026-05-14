import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { apiRequest } from "./client";

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
