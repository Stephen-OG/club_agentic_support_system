import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPriorityClassName, getPriorityLabel, getVisibleRequestPriority, visibleRequestPriorities } from "./priority-display";

describe("priority display", () => {
  it("keeps LOW compatible but displays the visible priority model", () => {
    assert.deepEqual(visibleRequestPriorities, ["NORMAL", "HIGH", "URGENT"]);
    assert.equal(getVisibleRequestPriority("LOW"), "NORMAL");
    assert.equal(getPriorityLabel("LOW"), "Normal");
    assert.equal(getPriorityClassName("LOW"), "normal");
  });
});
