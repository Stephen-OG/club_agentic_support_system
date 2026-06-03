import type { CommandRequestPriority, CommandRequestStatus } from "./auth/types";

type DashboardRequest = {
  id: string;
  venueId?: string;
  servicePointId?: string;
  title: string;
  category: string;
  priority: CommandRequestPriority;
  status: CommandRequestStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  satisfactionRating?: number | null;
  agentConfidence?: number | null;
  assignedTo?: { id: string; displayName: string | null; email: string | null } | null;
  servicePoint?: { id: string; label?: string | null; name?: string | null; zone?: string | null } | null;
};

type RatingValue = 1 | 2 | 3 | 4 | 5;
type AnomalySeverity = "high" | "medium" | "low";
export type DashboardVolumeWindow = "hourly" | "daily" | "weekly" | "monthly";

const closedStatuses = new Set<CommandRequestStatus>(["COMPLETED", "RESOLVED", "CANCELLED"]);
const urgentPriorities = new Set<CommandRequestPriority>(["HIGH", "URGENT"]);
const acknowledgementThresholdMinutes = 5;
const openWaitThresholdMinutes = 10;
const slaForecastThresholdMinutes = 10;
const lowConfidenceThreshold = 0.55;

export function calculateDashboardAnalytics(requests: DashboardRequest[], now = new Date()) {
  const categoryCounts = new Map<string, number>();
  const hourlyCounts = new Map<string, number>();
  const servicePointCounts = new Map<string, { servicePointId: string; label: string; zone: string | null; count: number; urgentOrHigh: number; lowRatings: number }>();
  const staffCounts = new Map<
    string,
    { staffId: string; label: string; openAssigned: number; completed: number; urgentOrHigh: number; completionMinutes: number[]; lowRatings: number }
  >();
  const venueCounts = new Map<
    string,
    { venueId: string; count: number; openRequests: number; urgentOrHigh: number; completionMinutes: number[]; ratings: RatingValue[] }
  >();
  const acknowledgementMinutes: number[] = [];
  const completionMinutes: number[] = [];
  const ratingDistribution: Record<RatingValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const lowRatedRequests: Array<{ id: string; rating: RatingValue; title: string }> = [];
  const slaRiskForecast: Array<{ id: string; title: string; priority: CommandRequestPriority; waitMinutes: number; minutesUntilBreach: number; risk: "breached" | "soon" }> = [];
  const lowConfidenceRequests: Array<{ id: string; title: string; confidence: number }> = [];
  const confidenceValues: number[] = [];
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
      const minutesUntilBreach = Math.max(0, slaForecastThresholdMinutes - waitMinutes);
      if (waitMinutes >= slaForecastThresholdMinutes || minutesUntilBreach <= 2) {
        slaRiskForecast.push({
          id: request.id,
          minutesUntilBreach,
          priority: request.priority,
          risk: waitMinutes >= slaForecastThresholdMinutes ? "breached" : "soon",
          title: request.title,
          waitMinutes
        });
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

    const servicePointId = request.servicePoint?.id || request.servicePointId;
    if (servicePointId) {
      const label = request.servicePoint?.label || request.servicePoint?.name || request.servicePointId || servicePointId;
      const current = servicePointCounts.get(servicePointId) ?? {
        count: 0,
        label,
        lowRatings: 0,
        servicePointId,
        urgentOrHigh: 0,
        zone: request.servicePoint?.zone ?? null
      };
      current.count += 1;
      if (urgentPriorities.has(request.priority)) {
        current.urgentOrHigh += 1;
      }
      if (rating && rating <= 2) {
        current.lowRatings += 1;
      }
      servicePointCounts.set(servicePointId, current);
    }

    if (request.assignedTo) {
      const staffId = request.assignedTo.id;
      const current = staffCounts.get(staffId) ?? {
        completed: 0,
        completionMinutes: [],
        label: request.assignedTo.displayName || request.assignedTo.email || "Unlabelled staff",
        lowRatings: 0,
        openAssigned: 0,
        staffId,
        urgentOrHigh: 0
      };
      if (isOpen) {
        current.openAssigned += 1;
      } else {
        current.completed += 1;
      }
      if (urgentPriorities.has(request.priority)) {
        current.urgentOrHigh += 1;
      }
      if (createdAt && completedAt) {
        current.completionMinutes.push(minutesBetween(createdAt, completedAt));
      }
      if (rating && rating <= 2) {
        current.lowRatings += 1;
      }
      staffCounts.set(staffId, current);
    }

    if (request.venueId) {
      const current = venueCounts.get(request.venueId) ?? {
        completionMinutes: [],
        count: 0,
        openRequests: 0,
        ratings: [],
        urgentOrHigh: 0,
        venueId: request.venueId
      };
      current.count += 1;
      if (isOpen) {
        current.openRequests += 1;
      }
      if (urgentPriorities.has(request.priority)) {
        current.urgentOrHigh += 1;
      }
      if (createdAt && completedAt) {
        current.completionMinutes.push(minutesBetween(createdAt, completedAt));
      }
      if (rating) {
        current.ratings.push(rating);
      }
      venueCounts.set(request.venueId, current);
    }

    if (typeof request.agentConfidence === "number" && Number.isFinite(request.agentConfidence)) {
      const confidence = Math.round(request.agentConfidence * 100) / 100;
      confidenceValues.push(confidence);
      if (confidence < lowConfidenceThreshold) {
        lowConfidenceRequests.push({ id: request.id, title: request.title, confidence });
      }
    }
  }

  const servicePointHotspots = Array.from(servicePointCounts.values())
    .sort((left, right) => right.count - left.count || right.urgentOrHigh - left.urgentOrHigh || left.label.localeCompare(right.label))
    .slice(0, 6);
  const staffWorkload = Array.from(staffCounts.values())
    .map(({ completionMinutes: staffCompletionMinutes, ...staff }) => ({
      ...staff,
      averageCompletionMinutes: averageMinutes(staffCompletionMinutes)
    }))
    .sort((left, right) => right.openAssigned - left.openAssigned || right.urgentOrHigh - left.urgentOrHigh || left.label.localeCompare(right.label));
  const venuePerformance = Array.from(venueCounts.values())
    .map(({ completionMinutes: venueCompletionMinutes, ratings: venueRatings, ...venue }) => ({
      ...venue,
      averageCompletionMinutes: averageMinutes(venueCompletionMinutes),
      averageRating: venueRatings.length ? Math.round((venueRatings.reduce((sum, value) => sum + value, 0) / venueRatings.length) * 10) / 10 : null
    }))
    .sort((left, right) => right.openRequests - left.openRequests || right.urgentOrHigh - left.urgentOrHigh || right.count - left.count);
  const operationalHealth = getOperationalHealth({
    lowConfidenceCount: lowConfidenceRequests.length,
    lowRatingCount: lowRatedRequests.length,
    slaRiskCount: slaRiskForecast.length,
    urgentOrHighPriority
  });
  const anomalies = getAnomalies({
    lowConfidenceCount: lowConfidenceRequests.length,
    servicePointHotspots,
    slaRiskCount: slaRiskForecast.length
  });

  return {
    liveHealth: {
      openRequests,
      urgentOrHighPriority,
      longestWaitingMinutes,
      slaBreaches
    },
    operationalHealth,
    slaRiskForecast: slaRiskForecast
      .sort((left, right) => left.minutesUntilBreach - right.minutesUntilBreach || priorityRank(right.priority) - priorityRank(left.priority) || right.waitMinutes - left.waitMinutes)
      .slice(0, 5),
    servicePointHotspots,
    staffWorkload,
    venuePerformance,
    aiTriageQuality: {
      averageConfidence: confidenceValues.length ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100) / 100 : null,
      lowConfidenceCount: lowConfidenceRequests.length,
      lowConfidenceRequests: lowConfidenceRequests.slice(0, 5)
    },
    anomalies,
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

function getOperationalHealth(input: { urgentOrHighPriority: number; slaRiskCount: number; lowRatingCount: number; lowConfidenceCount: number }) {
  const score = Math.max(0, 100 - input.urgentOrHighPriority * 12 - input.slaRiskCount * 10 - input.lowRatingCount * 8);
  const drivers: string[] = [];

  if (input.urgentOrHighPriority) {
    drivers.push(`${input.urgentOrHighPriority} urgent/high open`);
  }
  if (input.slaRiskCount) {
    drivers.push(`${input.slaRiskCount} SLA risks`);
  }
  if (input.lowRatingCount) {
    drivers.push(`${input.lowRatingCount} low rating${input.lowRatingCount === 1 ? "" : "s"}`);
  }
  if (input.lowConfidenceCount) {
    drivers.push(`${input.lowConfidenceCount} low-confidence AI triage`);
  }

  return {
    label: score < 50 ? "Critical" : score < 75 ? "Watch" : "Healthy",
    score,
    drivers
  };
}

function getAnomalies(input: {
  lowConfidenceCount: number;
  servicePointHotspots: Array<{ label: string; count: number }>;
  slaRiskCount: number;
}): Array<{ label: string; detail: string; severity: AnomalySeverity }> {
  const anomalies: Array<{ label: string; detail: string; severity: AnomalySeverity }> = [];

  if (input.slaRiskCount) {
    anomalies.push({
      detail: `${input.slaRiskCount} open request${input.slaRiskCount === 1 ? " is" : "s are"} at or near breach.`,
      label: "SLA pressure",
      severity: input.slaRiskCount >= 3 ? "high" : "medium"
    });
  }

  const topHotspot = input.servicePointHotspots[0];
  if (topHotspot && topHotspot.count >= 2) {
    anomalies.push({
      detail: `${topHotspot.label} has ${topHotspot.count} recent requests.`,
      label: "Service-point hotspot",
      severity: "medium"
    });
  }

  if (input.lowConfidenceCount) {
    anomalies.push({
      detail: `${input.lowConfidenceCount} request${input.lowConfidenceCount === 1 ? "" : "s"} has low triage confidence.`,
      label: "AI review needed",
      severity: "medium"
    });
  }

  return anomalies;
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

function priorityRank(priority: CommandRequestPriority) {
  return {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    URGENT: 4
  }[priority];
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
