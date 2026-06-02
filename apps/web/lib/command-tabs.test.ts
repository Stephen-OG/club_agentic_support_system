import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNextVisitedCommandViews } from "./command-tabs";

describe("command tabs", () => {
  it("keeps previously visited command views mounted without duplicates", () => {
    assert.deepEqual(getNextVisitedCommandViews(["dashboard"], "operations"), ["dashboard", "operations"]);
    assert.deepEqual(getNextVisitedCommandViews(["dashboard", "operations"], "dashboard"), ["dashboard", "operations"]);
  });
});
