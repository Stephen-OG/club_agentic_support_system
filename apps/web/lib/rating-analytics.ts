type RatingValue = 1 | 2 | 3 | 4 | 5;

type RatingMessage = {
  request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type RateableRequest = {
  satisfaction_rating?: number | null;
};

export type RatingAnalytics = {
  averageRating: number | null;
  ratedCount: number;
  highRatingCount: number;
  lowRatingCount: number;
  ratingDistribution: Record<RatingValue, number>;
};

export function extractLatestSatisfactionRatings(messages: RatingMessage[]) {
  const byRequest = new Map<string, { rating: RatingValue; createdAt: string }>();

  for (const message of messages) {
    if (!message.request_id) {
      continue;
    }

    const rating = normalizeRating(message.metadata?.satisfactionRating);
    if (!rating) {
      continue;
    }

    const current = byRequest.get(message.request_id);
    if (!current || message.created_at > current.createdAt) {
      byRequest.set(message.request_id, {
        rating,
        createdAt: message.created_at
      });
    }
  }

  return new Map(Array.from(byRequest, ([requestId, value]) => [requestId, value.rating]));
}

export function addSatisfactionRatingsToRequests<TRequest extends { id: string }>(
  requests: TRequest[],
  messages: RatingMessage[]
) {
  const ratings = extractLatestSatisfactionRatings(messages);

  return requests.map((request) => ({
    ...request,
    satisfaction_rating: ratings.get(request.id) || null
  }));
}

export function calculateRatingAnalytics(requests: RateableRequest[]): RatingAnalytics {
  const ratingDistribution: Record<RatingValue, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };

  const ratings = requests
    .map((request) => normalizeRating(request.satisfaction_rating))
    .filter((rating): rating is RatingValue => Boolean(rating));

  for (const rating of ratings) {
    ratingDistribution[rating] += 1;
  }

  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  const averageRating = ratings.length > 0 ? Math.round((total / ratings.length) * 10) / 10 : null;

  return {
    averageRating,
    ratedCount: ratings.length,
    highRatingCount: ratings.filter((rating) => rating >= 4).length,
    lowRatingCount: ratings.filter((rating) => rating <= 2).length,
    ratingDistribution
  };
}

function normalizeRating(value: unknown): RatingValue | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value >= 1 && value <= 5 ? (value as RatingValue) : null;
}
