import type { CommandRequestPriority, CommandRequestStatus } from "./auth/types";

type DashboardRequest = {
  id: string;
  title: string;
  category: string;
  priority: CommandRequestPriority;
  status: CommandRequestStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  satisfactionRating?: number | null;
};

type RatingValue = 1 | 2 | 3 | 4 | 5;
export type DashboardVolumeWindow = "hourly" | "daily" | "weekly" | "monthly";

const closedStatuses = new Set<CommandRequestStatus>(["COMPLETED", "RESOLVED", "CANCELLED"]);
const urgentPriorities = new Set<CommandRequestPriority>(["HIGH", "URGENT"]);
const acknowledgementThresholdMinutes = 5;
const openWaitThresholdMinutes = 10;

export function calculateDashboardAnalytics(requests: DashboardRequest[], now = new Date()) {
  const categoryCounts = new Map<string, number>();
  const hourlyCounts = new Map<string, number>();
  const acknowledgementMinutes: number[] = [];
  const completionMinutes: number[] = [];
  const ratingDistribution: Record<RatingValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const lowRatedRequests: Array<{ id: string; rating: RatingValue; title: string }> = [];
  const ratings: RatingValue[] = [];
  let openRequests = 0;
  let urgentOrHighPriority = 0;
  let longestWaitingMinutes = 0;
  let slaBreaches = 0;
  let overResponseThreshold = 0;

  for (const request of requests) {
    categoryCounts.set(request.category, (categoryCounts.get(request.category) ?? 0) + 1);

    const createdAt = parseDate(request.createdAt);
    if (createdAt) {
      const hour = `${String(createdAt.getUTCHours()).padStart(2, "0")}:00`;
      hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + 1);
    }

    const isOpen = !closedStatuses.has(request.status);
    if (isOpen) {
      openRequests += 1;
      if (urgentPriorities.has(request.priority)) {
        urgentOrHighPriority += 1;
      }

      const waitMinutes = createdAt ? minutesBetween(createdAt, now) : 0;
      longestWaitingMinutes = Math.max(longestWaitingMinutes, waitMinutes);
      if (waitMinutes >= openWaitThresholdMinutes) {
        slaBreaches += 1;
      }
    }

    const acknowledgedAt = parseDate(request.acknowledgedAt);
    if (createdAt && acknowledgedAt) {
      const minutes = minutesBetween(createdAt, acknowledgedAt);
      acknowledgementMinutes.push(minutes);
      if (minutes > acknowledgementThresholdMinutes) {
        overResponseThreshold += 1;
      }
    }

    const completedAt = parseDate(request.completedAt);
    if (createdAt && completedAt) {
      completionMinutes.push(minutesBetween(createdAt, completedAt));
    }

    const rating = normalizeRating(request.satisfactionRating);
    if (rating) {
      ratings.push(rating);
      ratingDistribution[rating] += 1;
      if (rating <= 2) {
        lowRatedRequests.push({ id: request.id, rating, title: request.title });
      }
    }
  }

  return {
    liveHealth: {
      openRequests,
      urgentOrHighPriority,
      longestWaitingMinutes,
      slaBreaches
    },
    requestVolumeByHour: Array.from(hourlyCounts, ([hour, count]) => ({ hour, count })).sort((left, right) => left.hour.localeCompare(right.hour)),
    categoryBreakdown: sortedCategoryCounts(categoryCounts, requests.length),
    responseSpeed: {
      averageAcknowledgementMinutes: averageMinutes(acknowledgementMinutes),
      averageCompletionMinutes: averageMinutes(completionMinutes),
      overResponseThreshold
    },
    satisfactionRecovery: {
      averageRating: ratings.length ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : null,
      lowRatingCount: lowRatedRequests.length,
      ratedCount: ratings.length,
      ratingDistribution: ([1, 2, 3, 4, 5] as RatingValue[]).map((rating) => ({ rating, count: ratingDistribution[rating] })),
      lowRatedRequests: lowRatedRequests.slice(0, 5)
    }
  };
}

export function getRequestVolumeSeries(requests: ReadonlyArray<Pick<DashboardRequest, "createdAt">>, window: DashboardVolumeWindow) {
  const counts = new Map<string, { count: number; order: number }>();

  for (const request of requests) {
    const createdAt = parseDate(request.createdAt);
    if (!createdAt) {
      continue;
    }

    const bucket = volumeBucket(createdAt, window);
    const current = counts.get(bucket.key);
    counts.set(bucket.key, {
      count: (current?.count ?? 0) + 1,
      order: bucket.order
    });
  }

  const series = Array.from(counts, ([label, value]) => ({
    label,
    count: value.count,
    order: value.order
  }))
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
    .map(({ label, count }) => ({ label, count }));
  const busiest = series.reduce<{ count: number; label: string } | null>(
    (best, item) => (!best || item.count > best.count ? item : best),
    null
  );

  return {
    label: volumeBusiestLabel(window),
    series,
    busiest
  };
}

function sortedCategoryCounts(counts: Map<string, number>, total: number) {
  return Array.from(counts, ([category, count]) => ({
    category,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0
  })).sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function averageMinutes(minutes: number[]) {
  return minutes.length ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length) : null;
}

function normalizeRating(value: number | null | undefined): RatingValue | null {
  return Number.isInteger(value) && value && value >= 1 && value <= 5 ? (value as RatingValue) : null;
}

function volumeBucket(date: Date, window: DashboardVolumeWindow) {
  if (window === "hourly") {
    const hour = date.getUTCHours();
    return {
      key: `${String(hour).padStart(2, "0")}:00`,
      order: hour
    };
  }

  if (window === "daily") {
    return {
      key: formatMonthDay(date),
      order: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    };
  }

  if (window === "weekly") {
    const start = startOfUtcWeek(date);
    return {
      key: `Week of ${formatMonthDay(start)}`,
      order: start.getTime()
    };
  }

  return {
    key: `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    order: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  };
}

function volumeBusiestLabel(window: DashboardVolumeWindow) {
  return {
    hourly: "Busiest hour",
    daily: "Busiest day",
    weekly: "Busiest week",
    monthly: "Busiest month"
  }[window];
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthDay(date: Date) {
  return `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function startOfUtcWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}
