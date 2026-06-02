import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateDashboardAnalytics } from "./dashboard-analytics";

describe("dashboard analytics", () => {
  it("calculates the five owner dashboard analytics from support requests", () => {
    const analytics = calculateDashboardAnalytics(
      [
        {
          id: "request-1",
          title: "Missing order",
          category: "missing_order",
          priority: "HIGH",
          status: "NEW",
          createdAt: "2026-06-02T12:00:00.000Z",
          acknowledgedAt: null,
          completedAt: null,
          satisfactionRating: null
        },
        {
          id: "request-2",
          title: "Water",
          category: "drink",
          priority: "NORMAL",
          status: "RESOLVED",
          createdAt: "2026-06-02T12:10:00.000Z",
          acknowledgedAt: "2026-06-02T12:13:00.000Z",
          completedAt: "2026-06-02T12:30:00.000Z",
          satisfactionRating: 5
        },
        {
          id: "request-3",
          title: "Long wait",
          category: "long_wait",
          priority: "URGENT",
          status: "IN_PROGRESS",
          createdAt: "2026-06-02T13:00:00.000Z",
          acknowledgedAt: "2026-06-02T13:09:00.000Z",
          completedAt: null,
          satisfactionRating: 2
        }
      ],
      new Date("2026-06-02T13:20:00.000Z")
    );

    assert.deepEqual(analytics.liveHealth, {
      openRequests: 2,
      urgentOrHighPriority: 2,
      longestWaitingMinutes: 80,
      slaBreaches: 2
    });
    assert.deepEqual(analytics.requestVolumeByHour, [
      { hour: "12:00", count: 2 },
      { hour: "13:00", count: 1 }
    ]);
    assert.deepEqual(analytics.categoryBreakdown, [
      { category: "drink", count: 1, percent: 33 },
      { category: "long_wait", count: 1, percent: 33 },
      { category: "missing_order", count: 1, percent: 33 }
    ]);
    assert.deepEqual(analytics.responseSpeed, {
      averageAcknowledgementMinutes: 6,
      averageCompletionMinutes: 20,
      overResponseThreshold: 1
    });
    assert.deepEqual(analytics.satisfactionRecovery, {
      averageRating: 3.5,
      lowRatingCount: 1,
      ratedCount: 2,
      ratingDistribution: [
        { rating: 1, count: 0 },
        { rating: 2, count: 1 },
        { rating: 3, count: 0 },
        { rating: 4, count: 0 },
        { rating: 5, count: 1 }
      ],
      lowRatedRequests: [
        {
          id: "request-3",
          rating: 2,
          title: "Long wait"
        }
      ]
    });
  });

  it("handles missing timestamps and empty data", () => {
    const analytics = calculateDashboardAnalytics([], new Date("2026-06-02T13:20:00.000Z"));

    assert.equal(analytics.liveHealth.openRequests, 0);
    assert.equal(analytics.responseSpeed.averageAcknowledgementMinutes, null);
    assert.equal(analytics.responseSpeed.averageCompletionMinutes, null);
    assert.equal(analytics.satisfactionRecovery.averageRating, null);
    assert.deepEqual(analytics.requestVolumeByHour, []);
  });
});
