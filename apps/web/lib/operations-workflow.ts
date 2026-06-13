import type { CommandRequestStatus } from "./auth/types";

export type OperationsBucket = "active" | "completed";
export type OperationsStatusTone = "blue" | "green" | "red" | "yellow" | "neutral";
export const operationsPollIntervalMs = 30000;

export type RequestOperationAction = {
  label: "Acknowledge" | "Complete";
  targetStatus: CommandRequestStatus;
  autoAdvanceToStatus?: CommandRequestStatus;
  requiresInProgressFirst?: boolean;
};

const completedStatuses = new Set<CommandRequestStatus>(["COMPLETED", "RESOLVED", "CANCELLED"]);

export function getOperationsBucket(status: CommandRequestStatus): OperationsBucket {
  return completedStatuses.has(status) ? "completed" : "active";
}

export function getOperationsStatusTone(status: CommandRequestStatus): OperationsStatusTone {
  if (status === "ACKNOWLEDGED") {
    return "blue";
  }

  if (status === "IN_PROGRESS") {
    return "yellow";
  }

  if (status === "COMPLETED" || status === "RESOLVED") {
    return "green";
  }

  if (status === "CANCELLED" || status === "DECLINED" || status === "ESCALATED") {
    return "red";
  }

  return "neutral";
}

export function getRequestOperationAction(status: CommandRequestStatus): RequestOperationAction | null {
  if (status === "NEW") {
    return {
      label: "Acknowledge",
      targetStatus: "ACKNOWLEDGED",
      autoAdvanceToStatus: "IN_PROGRESS"
    };
  }

  if (status === "ESCALATED") {
    return {
      label: "Acknowledge",
      targetStatus: "IN_PROGRESS"
    };
  }

  if (status === "ACKNOWLEDGED" || status === "ASSIGNED") {
    return {
      label: "Complete",
      targetStatus: "COMPLETED",
      requiresInProgressFirst: true
    };
  }

  if (status === "IN_PROGRESS") {
    return {
      label: "Complete",
      targetStatus: "COMPLETED"
    };
  }

  return null;
}

export function summarizeOperationsBuckets<T extends { status: CommandRequestStatus }>(requests: T[]) {
  return requests.reduce(
    (summary, request) => {
      if (getOperationsBucket(request.status) === "active") {
        summary.activeCount += 1;
      } else {
        summary.completedCount += 1;
      }

      return summary;
    },
    { activeCount: 0, completedCount: 0 }
  );
}

export function getOperationsNotifications<T extends { id: string; title: string; status: CommandRequestStatus; priority: string }>(
  knownRequestIds: Set<string>,
  requests: T[]
) {
  return requests
    .filter((request) => !knownRequestIds.has(request.id) && getOperationsBucket(request.status) === "active")
    .map((request) => ({
      id: request.id,
      title: request.priority === "URGENT" || request.status === "ESCALATED" ? "Urgent guest request" : "New guest request",
      body: request.title
    }));
}

export function mergeOperationRequestUpdate<
  T extends {
    id: string;
    recentMessages?: unknown;
    satisfactionRating?: unknown;
  }
>(existing: T, updated: Partial<T> & { id: string }): T {
  return {
    ...existing,
    ...updated,
    recentMessages: updated.recentMessages ?? existing.recentMessages,
    satisfactionRating: updated.satisfactionRating ?? existing.satisfactionRating
  };
}

export function sortOperationsQueue<T extends { priority: string }>(requests: T[]) {
  return requests
    .map((request, index) => ({ index, request }))
    .sort((left, right) => {
      const leftUrgent = left.request.priority === "URGENT";
      const rightUrgent = right.request.priority === "URGENT";

      if (leftUrgent !== rightUrgent) {
        return leftUrgent ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map((item) => item.request);
}

export function sortCompletedOperationsQueue<T extends { completedAt?: string | null; resolvedAt?: string | null; updatedAt?: string | null }>(
  requests: T[]
) {
  return requests
    .map((request, index) => ({ index, request }))
    .sort((left, right) => {
      const diff = completionTimestamp(right.request) - completionTimestamp(left.request);
      return diff || left.index - right.index;
    })
    .map((item) => item.request);
}

export function formatOperationsElapsedLabel(
  request: {
    status: CommandRequestStatus;
    createdAt: string;
    completedAt?: string | null;
    resolvedAt?: string | null;
    updatedAt?: string | null;
  },
  now = new Date()
) {
  const created = new Date(request.createdAt);

  if (Number.isNaN(created.getTime())) {
    return "Time unavailable";
  }

  if (getOperationsBucket(request.status) === "completed") {
    const completed = new Date(request.completedAt || request.resolvedAt || request.updatedAt || "");

    if (Number.isNaN(completed.getTime())) {
      return "Completed";
    }

    return `Completed in ${formatElapsedDuration(completed.getTime() - created.getTime())}`;
  }

  return formatWaitDuration(now.getTime() - created.getTime());
}

export function paginateOperationsRequests<T>(requests: readonly T[], input: { page: number; pageSize: number }) {
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const totalPages = Math.max(1, Math.ceil(requests.length / pageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(input.page)), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    currentPage,
    endItem: requests.length === 0 ? 0 : Math.min(startIndex + pageSize, requests.length),
    items: requests.slice(startIndex, startIndex + pageSize),
    pageSize,
    startItem: requests.length === 0 ? 0 : startIndex + 1,
    totalItems: requests.length,
    totalPages
  };
}

function completionTimestamp(request: { completedAt?: string | null; resolvedAt?: string | null; updatedAt?: string | null }) {
  const value = request.completedAt || request.resolvedAt || request.updatedAt || "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatWaitDuration(durationMs: number) {
  const elapsedMinutes = elapsedMinuteCount(durationMs);

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  return `${formatMinuteCount(elapsedMinutes)} waiting`;
}

function formatElapsedDuration(durationMs: number) {
  const elapsedMinutes = elapsedMinuteCount(durationMs);

  if (elapsedMinutes < 1) {
    return "<1m";
  }

  return formatMinuteCount(elapsedMinutes);
}

function elapsedMinuteCount(durationMs: number) {
  return Math.max(0, Math.round(durationMs / 60000));
}

function formatMinuteCount(elapsedMinutes: number) {
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
