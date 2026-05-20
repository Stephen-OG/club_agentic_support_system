import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addSatisfactionRatingsToRequests,
  calculateRatingAnalytics,
  extractLatestSatisfactionRatings
} from "./rating-analytics";

describe("rating analytics", () => {
  it("extracts the latest 1-5 satisfaction rating per request", () => {
    const ratings = extractLatestSatisfactionRatings([
      {
        request_id: "request-1",
        metadata: { satisfactionRating: 2 },
        created_at: "2026-05-10T10:00:00.000Z"
      },
      {
        request_id: "request-1",
        metadata: { satisfactionRating: 5 },
        created_at: "2026-05-10T11:00:00.000Z"
      },
      {
        request_id: "request-2",
        metadata: { satisfactionRating: 6 },
        created_at: "2026-05-10T11:00:00.000Z"
      },
      {
        request_id: null,
        metadata: { satisfactionRating: 4 },
        created_at: "2026-05-10T11:00:00.000Z"
      }
    ]);

    assert.deepEqual(Object.fromEntries(ratings), {
      "request-1": 5
    });
  });

  it("adds satisfaction ratings to matching requests", () => {
    const requests = addSatisfactionRatingsToRequests(
      [
        { id: "request-1", title: "Water" },
        { id: "request-2", title: "Bill" }
      ],
      [
        {
          request_id: "request-2",
          metadata: { satisfactionRating: 3 },
          created_at: "2026-05-10T11:00:00.000Z"
        }
      ]
    );

    assert.deepEqual(requests, [
      { id: "request-1", title: "Water", satisfaction_rating: null },
      { id: "request-2", title: "Bill", satisfaction_rating: 3 }
    ]);
  });

  it("calculates dashboard analytics from rated requests", () => {
    assert.deepEqual(
      calculateRatingAnalytics([
        { satisfaction_rating: 5 },
        { satisfaction_rating: 4 },
        { satisfaction_rating: 2 },
        { satisfaction_rating: null },
        {}
      ]),
      {
        averageRating: 3.7,
        ratedCount: 3,
        highRatingCount: 2,
        lowRatingCount: 1,
        highRatingPercent: 67,
        ratingDistribution: {
          1: 0,
          2: 1,
          3: 0,
          4: 1,
          5: 1
        }
      }
    );
  });

  it("calculates command center analytics from camelCase satisfaction ratings", () => {
    assert.deepEqual(
      calculateRatingAnalytics([
        { satisfactionRating: 5 },
        { satisfactionRating: 4 },
        { satisfactionRating: 1 },
        { satisfactionRating: null },
        {}
      ]),
      {
        averageRating: 3.3,
        ratedCount: 3,
        highRatingCount: 2,
        lowRatingCount: 1,
        highRatingPercent: 67,
        ratingDistribution: {
          1: 1,
          2: 0,
          3: 0,
          4: 1,
          5: 1
        }
      }
    );
  });
});
