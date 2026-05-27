import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateOperationsAnalytics } from "./operations-analytics";

describe("operations analytics", () => {
  it("summarizes category counts, completion time, busiest hours, and slow unresolved work", () => {
    const analytics = calculateOperationsAnalytics(
      [
        {
          id: "request-1",
          category: "drink",
          status: "RESOLVED",
          createdAt: "2026-05-26T10:00:00.000Z",
          completedAt: "2026-05-26T10:12:00.000Z"
        },
        {
          id: "request-2",
          category: "drink",
          status: "COMPLETED",
          createdAt: "2026-05-26T10:30:00.000Z",
          completedAt: "2026-05-26T10:42:00.000Z"
        },
        {
          id: "request-3",
          category: "safety",
          status: "IN_PROGRESS",
          createdAt: "2026-05-26T09:00:00.000Z",
          completedAt: null
        },
        {
          id: "request-4",
          category: "payment",
          status: "CANCELLED",
          createdAt: "2026-05-26T11:05:00.000Z",
          completedAt: null
        }
      ],
      new Date("2026-05-26T10:40:00.000Z")
    );

    assert.deepEqual(analytics.requestCountByCategory, [
      { category: "drink", count: 2 },
      { category: "payment", count: 1 },
      { category: "safety", count: 1 }
    ]);
    assert.equal(analytics.averageCompletionMinutes, 12);
    assert.deepEqual(analytics.busiestHours, [
      { hour: "10:00", count: 2 },
      { hour: "09:00", count: 1 },
      { hour: "11:00", count: 1 }
    ]);
    assert.equal(analytics.unresolvedCount, 1);
    assert.equal(analytics.slowRequestCount, 1);
  });
});
