import type { CommandRequestStatus } from "./auth/types";

export type OperationsBucket = "active" | "completed";
export type OperationsStatusTone = "blue" | "green" | "red" | "yellow" | "neutral";
export const operationsPollIntervalMs = 5000;

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

  if (status === "ACKNOWLEDGED" || status === "ASSIGNED" || status === "ESCALATED") {
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
