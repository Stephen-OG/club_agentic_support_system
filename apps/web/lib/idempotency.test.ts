import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIdempotencyKey, claimIdempotencyKey, releaseIdempotencyKey } from "./idempotency";

describe("idempotency", () => {
  it("generates unique keys", () => {
    const a = createIdempotencyKey();
    const b = createIdempotencyKey();
    assert.notEqual(a, b);
  });

  it("claims and rejects duplicate keys", () => {
    const key = createIdempotencyKey();
    assert.equal(claimIdempotencyKey(key), true);
    assert.equal(claimIdempotencyKey(key), false);
  });

  it("releases keys for reuse tracking", () => {
    const key = createIdempotencyKey();
    claimIdempotencyKey(key);
    releaseIdempotencyKey(key);
    assert.equal(claimIdempotencyKey(key), true);
  });
});
