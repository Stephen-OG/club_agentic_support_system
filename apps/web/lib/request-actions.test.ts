import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getClientActionResult } from "./request-actions";

describe("getClientActionResult", () => {
  it("resolves a completed request with a 1-5 satisfaction rating", () => {
    const result = getClientActionResult("confirm_resolved", "completed", 4);

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(result.status, "resolved");
      assert.equal(result.satisfactionRating, 4);
      assert.equal(result.message, "Thank you. You rated this service 4/5, and we really appreciate the feedback.");
    }
  });

  it("requires a valid satisfaction rating before resolving", () => {
    for (const rating of [undefined, 0, 6, 3.5, "5"]) {
      const result = getClientActionResult("confirm_resolved", "completed", rating);

      assert.equal(result.allowed, false);
      if (!result.allowed) {
        assert.equal(result.error, "A satisfaction rating from 1 to 5 is required");
      }
    }
  });

  it("keeps not-satisfied feedback as an in-progress request", () => {
    const result = getClientActionResult("not_satisfied", "completed");

    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(result.status, "in_progress");
      assert.equal(result.satisfactionRating, null);
      assert.equal(
        result.message,
        "Thanks for letting us know. I have reopened this for the team, and they will keep working on it."
      );
    }
  });
});
