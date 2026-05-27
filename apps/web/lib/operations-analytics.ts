import type { CommandRequestStatus } from "./auth/types";

type OperationsRequest = {
  id: string;
  category: string;
  status: CommandRequestStatus;
  createdAt: string;
  completedAt: string | null;
};

export type OperationsAnalytics = {
  requestCountByCategory: Array<{ category: string; count: number }>;
  averageCompletionMinutes: number | null;
  busiestHours: Array<{ hour: string; count: number }>;
  unresolvedCount: number;
  slowRequestCount: number;
};

const closedStatuses = new Set<CommandRequestStatus>(["COMPLETED", "RESOLVED", "CANCELLED"]);
const slowRequestThresholdMinutes = 30;

export function calculateOperationsAnalytics(requests: OperationsRequest[], now = new Date()): OperationsAnalytics {
  const categoryCounts = new Map<string, number>();
  const hourlyCounts = new Map<string, number>();
  const completionMinutes: number[] = [];
  let unresolvedCount = 0;
  let slowRequestCount = 0;

  for (const request of requests) {
    categoryCounts.set(request.category, (categoryCounts.get(request.category) ?? 0) + 1);

    const createdAt = new Date(request.createdAt);
    const hour = `${String(createdAt.getUTCHours()).padStart(2, "0")}:00`;
    hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + 1);

    if (request.completedAt) {
      const completedAt = new Date(request.completedAt);
      completionMinutes.push(Math.max(0, Math.round((completedAt.getTime() - createdAt.getTime()) / 60000)));
    }

    if (!closedStatuses.has(request.status)) {
      unresolvedCount += 1;
      const ageMinutes = Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 60000));
      if (ageMinutes >= slowRequestThresholdMinutes) {
        slowRequestCount += 1;
      }
    }
  }

  return {
    requestCountByCategory: sortedCounts(categoryCounts, "category"),
    averageCompletionMinutes: completionMinutes.length
      ? Math.round(completionMinutes.reduce((sum, minutes) => sum + minutes, 0) / completionMinutes.length)
      : null,
    busiestHours: sortedCounts(hourlyCounts, "hour").slice(0, 3),
    unresolvedCount,
    slowRequestCount
  };
}

function sortedCounts<TKey extends "category" | "hour">(counts: Map<string, number>, key: TKey) {
  return Array.from(counts, ([label, count]) => ({ [key]: label, count }) as { [K in TKey]: string } & { count: number }).sort(
    (left, right) => right.count - left.count || String(left[key]).localeCompare(String(right[key]))
  );
}
