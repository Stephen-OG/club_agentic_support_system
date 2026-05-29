import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSatisfactionRating } from "./ratings";

describe("normalizeSatisfactionRating", () => {
  it("accepts integers 1 through 5", () => {
    assert.equal(normalizeSatisfactionRating(1), 1);
    assert.equal(normalizeSatisfactionRating(3), 3);
    assert.equal(normalizeSatisfactionRating(5), 5);
  });

  it("rejects values outside 1-5", () => {
    assert.equal(normalizeSatisfactionRating(0), null);
    assert.equal(normalizeSatisfactionRating(6), null);
  });

  it("rejects non-integer numbers", () => {
    assert.equal(normalizeSatisfactionRating(3.5), null);
  });

  it("rejects non-number types", () => {
    assert.equal(normalizeSatisfactionRating("5"), null);
    assert.equal(normalizeSatisfactionRating(null), null);
    assert.equal(normalizeSatisfactionRating(undefined), null);
    assert.equal(normalizeSatisfactionRating({}), null);
  });
});
