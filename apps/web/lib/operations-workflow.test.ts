import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOperationsNotifications,
  getOperationsBucket,
  getOperationsStatusTone,
  getRequestOperationAction,
  operationsPollIntervalMs,
  summarizeOperationsBuckets
} from "./operations-workflow";

describe("operations workflow", () => {
  it("separates active and completed request buckets with counts", () => {
    const summary = summarizeOperationsBuckets([
      { status: "NEW" },
      { status: "ACKNOWLEDGED" },
      { status: "IN_PROGRESS" },
      { status: "DECLINED" },
      { status: "COMPLETED" },
      { status: "CANCELLED" },
      { status: "RESOLVED" }
    ]);

    assert.equal(summary.activeCount, 4);
    assert.equal(summary.completedCount, 3);
    assert.equal(getOperationsBucket("ACKNOWLEDGED"), "active");
    assert.equal(getOperationsBucket("COMPLETED"), "completed");
    assert.equal(getOperationsBucket("CANCELLED"), "completed");
  });

  it("moves acknowledged work toward in progress without showing an in progress button", () => {
    assert.deepEqual(getRequestOperationAction("NEW"), {
      label: "Acknowledge",
      targetStatus: "ACKNOWLEDGED",
      autoAdvanceToStatus: "IN_PROGRESS"
    });

    assert.deepEqual(getRequestOperationAction("ACKNOWLEDGED"), {
      label: "Complete",
      targetStatus: "COMPLETED",
      requiresInProgressFirst: true
    });

    assert.deepEqual(getRequestOperationAction("IN_PROGRESS"), {
      label: "Complete",
      targetStatus: "COMPLETED"
    });
  });

  it("uses the requested colors for operational status tones", () => {
    assert.equal(getOperationsStatusTone("ACKNOWLEDGED"), "blue");
    assert.equal(getOperationsStatusTone("IN_PROGRESS"), "yellow");
    assert.equal(getOperationsStatusTone("COMPLETED"), "green");
    assert.equal(getOperationsStatusTone("CANCELLED"), "red");
  });

  it("polls operations often enough for live queue updates", () => {
    assert.equal(operationsPollIntervalMs, 5000);
  });

  it("notifies only for newly seen active requests", () => {
    const notifications = getOperationsNotifications(new Set(["request-1"]), [
      { id: "request-1", title: "Known", status: "NEW", priority: "NORMAL" },
      { id: "request-2", title: "Need help", status: "NEW", priority: "NORMAL" },
      { id: "request-3", title: "Safety", status: "ESCALATED", priority: "URGENT" },
      { id: "request-4", title: "Done", status: "COMPLETED", priority: "LOW" }
    ]);

    assert.deepEqual(notifications, [
      {
        id: "request-2",
        title: "New guest request",
        body: "Need help"
      },
      {
        id: "request-3",
        title: "Urgent guest request",
        body: "Safety"
      }
    ]);
  });
});
