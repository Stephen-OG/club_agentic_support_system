import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getStaffNextStatus, getStaffQueueBucket, summarizeStaffQueueBuckets, staffQueuePollIntervalMs } from "./staff-workflow";

describe("staff workflow", () => {
  it("lets staff acknowledge new work before starting it", () => {
    assert.equal(getStaffNextStatus("NEW"), "ACKNOWLEDGED");
    assert.equal(getStaffNextStatus("ACKNOWLEDGED"), "IN_PROGRESS");
    assert.equal(getStaffNextStatus("ASSIGNED"), "IN_PROGRESS");
    assert.equal(getStaffNextStatus("IN_PROGRESS"), "COMPLETED");
    assert.equal(getStaffNextStatus("COMPLETED"), null);
  });

  it("polls often enough for a near-real-time queue without being noisy", () => {
    assert.equal(staffQueuePollIntervalMs, 5000);
  });

  it("separates staff queue into active and completed buckets", () => {
    const summary = summarizeStaffQueueBuckets([
      { status: "NEW" },
      { status: "IN_PROGRESS" },
      { status: "COMPLETED" },
      { status: "RESOLVED" },
      { status: "CANCELLED" }
    ]);

    assert.deepEqual(summary, {
      activeCount: 2,
      completedCount: 3
    });
    assert.equal(getStaffQueueBucket("NEW"), "active");
    assert.equal(getStaffQueueBucket("COMPLETED"), "completed");
  });
});
