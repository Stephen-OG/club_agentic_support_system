import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPriority } from "./priority-classifier";

describe("classifyPriority", () => {
  it("treats medical and safety language as urgent", () => {
    assert.equal(classifyPriority("Someone has a severe allergy reaction"), "urgent");
    assert.equal(classifyPriority("There is broken glass and blood at the table"), "urgent");
  });

  it("keeps active service failures high", () => {
    assert.equal(classifyPriority("We have been waiting too long and the food is cold"), "high");
    assert.equal(classifyPriority("There is a spill near our table"), "high");
  });

  it("classifies routine service requests as normal", () => {
    assert.equal(classifyPriority("Can we get napkins and water?"), "normal");
  });

  it("classifies informational requests as low", () => {
    assert.equal(classifyPriority("What is the wifi password?"), "low");
  });

  it("lets stronger deterministic rules win", () => {
    assert.equal(classifyPriority("Can I get water? Also someone cannot breathe."), "urgent");
  });
});
