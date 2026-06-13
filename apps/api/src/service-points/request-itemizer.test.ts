import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itemizeGuestRequestMessage } from "./request-itemizer";

describe("guest request itemizer", () => {
  it("splits a single guest message with multiple actionable asks into request items", () => {
    assert.deepEqual(
      itemizeGuestRequestMessage("I have been waiting too long and I also said I need a glass of water"),
      ["I have been waiting too long", "I need a glass of water"]
    );
  });
});
