import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAdminDashboardControls, calculateDashboardAnalytics, getRequestVolumeSeries } from "./dashboard-analytics";

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
    assert.equal(analytics.operationalHealth.score, 100);
    assert.deepEqual(analytics.slaRiskForecast, []);
    assert.deepEqual(analytics.servicePointHotspots, []);
    assert.deepEqual(analytics.staffWorkload, []);
    assert.deepEqual(analytics.venuePerformance, []);
    assert.equal(analytics.aiTriageQuality.lowConfidenceCount, 0);
    assert.deepEqual(analytics.anomalies, []);
    assert.equal(analytics.responseSpeed.averageAcknowledgementMinutes, null);
    assert.equal(analytics.responseSpeed.averageCompletionMinutes, null);
    assert.equal(analytics.satisfactionRecovery.averageRating, null);
    assert.deepEqual(analytics.requestVolumeByHour, []);
  });

  it("surfaces advanced admin decision analytics", () => {
    const analytics = calculateDashboardAnalytics(
      [
        {
          id: "request-1",
          venueId: "venue-a",
          qrPointId: "table-7",
          title: "Table 7 payment terminal is down",
          category: "payment",
          priority: "URGENT",
          status: "NEW",
          createdAt: "2026-06-02T13:11:00.000Z",
          acknowledgedAt: null,
          completedAt: null,
          satisfactionRating: null,
          agentConfidence: 0.42,
          assignedTo: null,
          qrPoint: { id: "table-7", name: "Table 7", zone: "Terrace" }
        },
        {
          id: "request-2",
          venueId: "venue-a",
          qrPointId: "table-7",
          title: "Table 7 still waiting for drinks",
          category: "service",
          priority: "HIGH",
          status: "ASSIGNED",
          createdAt: "2026-06-02T13:03:00.000Z",
          acknowledgedAt: "2026-06-02T13:05:00.000Z",
          completedAt: null,
          satisfactionRating: 2,
          agentConfidence: 0.91,
          assignedTo: { id: "staff-1", displayName: "Maya", email: "maya@example.com" },
          qrPoint: { id: "table-7", name: "Table 7", zone: "Terrace" }
        },
        {
          id: "request-3",
          venueId: "venue-b",
          qrPointId: "bar-1",
          title: "Bar spill",
          category: "cleaning",
          priority: "NORMAL",
          status: "RESOLVED",
          createdAt: "2026-06-02T12:30:00.000Z",
          acknowledgedAt: "2026-06-02T12:36:00.000Z",
          completedAt: "2026-06-02T12:47:00.000Z",
          satisfactionRating: 5,
          agentConfidence: 0.88,
          assignedTo: { id: "staff-2", displayName: "Noor", email: "noor@example.com" },
          qrPoint: { id: "bar-1", name: "Main Bar", zone: null }
        },
        {
          id: "request-4",
          venueId: "venue-a",
          qrPointId: "booth-2",
          title: "Booth 2 needs security",
          category: "security",
          priority: "URGENT",
          status: "IN_PROGRESS",
          createdAt: "2026-06-02T12:48:00.000Z",
          acknowledgedAt: "2026-06-02T12:58:00.000Z",
          completedAt: null,
          satisfactionRating: null,
          agentConfidence: 0.67,
          assignedTo: { id: "staff-1", displayName: "Maya", email: "maya@example.com" },
          qrPoint: { id: "booth-2", name: "Booth 2", zone: "VIP" }
        }
      ],
      new Date("2026-06-02T13:20:00.000Z")
    );

    assert.deepEqual(analytics.operationalHealth, {
      label: "Critical",
      score: 26,
      drivers: ["3 urgent/high open", "3 SLA risks", "1 low rating", "1 low-confidence AI triage"]
    });
    assert.deepEqual(analytics.slaRiskForecast.map((request) => ({ id: request.id, minutesUntilBreach: request.minutesUntilBreach, risk: request.risk })), [
      { id: "request-4", minutesUntilBreach: 0, risk: "breached" },
      { id: "request-2", minutesUntilBreach: 0, risk: "breached" },
      { id: "request-1", minutesUntilBreach: 1, risk: "soon" }
    ]);
    assert.deepEqual(analytics.servicePointHotspots.slice(0, 2), [
      { servicePointId: "table-7", label: "Table 7", zone: "Terrace", count: 2, urgentOrHigh: 2, lowRatings: 1 },
      { servicePointId: "booth-2", label: "Booth 2", zone: "VIP", count: 1, urgentOrHigh: 1, lowRatings: 0 }
    ]);
    assert.deepEqual(analytics.staffWorkload, [
      { staffId: "staff-1", label: "Maya", openAssigned: 2, completed: 0, urgentOrHigh: 2, averageCompletionMinutes: null, lowRatings: 1 },
      { staffId: "staff-2", label: "Noor", openAssigned: 0, completed: 1, urgentOrHigh: 0, averageCompletionMinutes: 17, lowRatings: 0 }
    ]);
    assert.deepEqual(analytics.venuePerformance, [
      { venueId: "venue-a", count: 3, openRequests: 3, urgentOrHigh: 3, averageCompletionMinutes: null, averageRating: 2 },
      { venueId: "venue-b", count: 1, openRequests: 0, urgentOrHigh: 0, averageCompletionMinutes: 17, averageRating: 5 }
    ]);
    assert.deepEqual(analytics.aiTriageQuality, {
      averageConfidence: 0.72,
      lowConfidenceCount: 1,
      lowConfidenceRequests: [{ id: "request-1", title: "Table 7 payment terminal is down", confidence: 0.42 }]
    });
    assert.deepEqual(analytics.anomalies, [
      { label: "SLA pressure", detail: "3 open requests are at or near breach.", severity: "high" },
      { label: "Service-point hotspot", detail: "Table 7 has 2 recent requests.", severity: "medium" },
      { label: "AI review needed", detail: "1 request has low triage confidence.", severity: "medium" }
    ]);
  });

  it("groups request volume by the selected dashboard time window", () => {
    const requests = [
      {
        id: "request-1",
        title: "Water",
        category: "drink",
        priority: "NORMAL",
        status: "NEW",
        createdAt: "2026-06-01T09:10:00.000Z",
        acknowledgedAt: null,
        completedAt: null
      },
      {
        id: "request-2",
        title: "Bill",
        category: "payment",
        priority: "NORMAL",
        status: "NEW",
        createdAt: "2026-06-01T09:40:00.000Z",
        acknowledgedAt: null,
        completedAt: null
      },
      {
        id: "request-3",
        title: "Spill",
        category: "spill",
        priority: "HIGH",
        status: "NEW",
        createdAt: "2026-06-02T10:05:00.000Z",
        acknowledgedAt: null,
        completedAt: null
      },
      {
        id: "request-4",
        title: "Safety",
        category: "safety",
        priority: "URGENT",
        status: "NEW",
        createdAt: "2026-06-09T12:05:00.000Z",
        acknowledgedAt: null,
        completedAt: null
      }
    ] as const;

    assert.deepEqual(getRequestVolumeSeries(requests, "hourly"), {
      label: "Busiest hour",
      series: [
        { label: "09:00", count: 2 },
        { label: "10:00", count: 1 },
        { label: "12:00", count: 1 }
      ],
      busiest: { label: "09:00", count: 2 }
    });

    assert.deepEqual(getRequestVolumeSeries(requests, "daily"), {
      label: "Busiest day",
      series: [
        { label: "Jun 1", count: 2 },
        { label: "Jun 2", count: 1 },
        { label: "Jun 9", count: 1 }
      ],
      busiest: { label: "Jun 1", count: 2 }
    });

    assert.deepEqual(getRequestVolumeSeries(requests, "weekly"), {
      label: "Busiest week",
      series: [
        { label: "Week of Jun 1", count: 3 },
        { label: "Week of Jun 8", count: 1 }
      ],
      busiest: { label: "Week of Jun 1", count: 3 }
    });

    assert.deepEqual(getRequestVolumeSeries(requests, "monthly"), {
      label: "Busiest month",
      series: [{ label: "Jun 2026", count: 4 }],
      busiest: { label: "Jun 2026", count: 4 }
    });
  });

  it("calculates admin control summary from venues and requests", () => {
    const controls = calculateAdminDashboardControls(
      [
        {
          id: "venue-a",
          name: "Main Room",
          hours: [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "17:00", isClosed: false }],
          qrPoints: [
            { id: "qr-1", isActive: true },
            { id: "qr-2", isActive: false }
          ]
        },
        {
          id: "venue-b",
          name: "Roof Bar",
          hours: [],
          qrPoints: []
        }
      ],
      [
        {
          id: "request-1",
          title: "VIP table waiting",
          category: "service",
          priority: "HIGH",
          status: "NEW",
          createdAt: "2026-06-02T12:00:00.000Z",
          acknowledgedAt: null,
          completedAt: null,
          venueId: "venue-a",
          assignedTo: null
        },
        {
          id: "request-2",
          title: "Security review",
          category: "security",
          priority: "URGENT",
          status: "ESCALATED",
          createdAt: "2026-06-02T12:10:00.000Z",
          acknowledgedAt: null,
          completedAt: null,
          venueId: "venue-a",
          assignedTo: null
        },
        {
          id: "request-3",
          title: "Completed water",
          category: "drink",
          priority: "NORMAL",
          status: "COMPLETED",
          createdAt: "2026-06-02T12:20:00.000Z",
          acknowledgedAt: null,
          completedAt: "2026-06-02T12:30:00.000Z",
          venueId: "venue-b",
          assignedTo: null
        }
      ]
    );

    assert.deepEqual(controls, {
      activeServicePoints: 1,
      inactiveServicePoints: 1,
      escalatedRequests: 1,
      openUnassignedRequests: 2,
      urgentUnassignedRequests: 2,
      venueSetupGaps: [
        { venueId: "venue-b", venueName: "Roof Bar", gaps: ["opening hours", "active service points"] }
      ]
    });
  });
});
