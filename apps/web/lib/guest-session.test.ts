import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuestSessionHeaders, defaultRandomValue, getOrCreateGuestSessionId } from "./guest-session";

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}

describe("guest session", () => {
  it("creates and reuses a browser-stored guest session id", () => {
    const storage = memoryStorage();
    const first = getOrCreateGuestSessionId("qr:session", storage, () => "abc-123");
    const second = getOrCreateGuestSessionId("qr:session", storage, () => "different");

    assert.equal(first, "guest_abc_123");
    assert.equal(second, "guest_abc_123");
  });

  it("sends guest session ids in headers instead of URL query parameters", () => {
    assert.deepEqual(createGuestSessionHeaders("guest_123"), { "X-Guest-Session": "guest_123" });
    assert.deepEqual(createGuestSessionHeaders(""), {});
  });

  it("uses cryptographic random bytes when randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues(values: Uint8Array) {
          values.fill(10);
          return values;
        }
      }
    });

    try {
      assert.equal(defaultRandomValue(), "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a");
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto
      });
    }
  });
});
