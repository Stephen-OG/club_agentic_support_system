import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { determineAssignmentRoute } from "./assignment-routing.service";

describe("determineAssignmentRoute", () => {
  it("routes urgent safety and security requests to the security queue", () => {
    const route = determineAssignmentRoute({
      category: "general",
      message: "There is broken glass and someone is hurt near the bar",
      priority: "urgent"
    });

    assert.deepEqual(route, {
      queue: "security",
      reason: "urgent safety/security routing",
      requiresHumanAssignment: true
    });
  });

  it("routes missing order requests to floor staff without assigning a person", () => {
    const route = determineAssignmentRoute({
      category: "general",
      message: "Our food order is missing",
      priority: "high"
    });

    assert.deepEqual(route, {
      queue: "floor",
      reason: "guest service/order follow-up",
      requiresHumanAssignment: true
    });
  });
});
