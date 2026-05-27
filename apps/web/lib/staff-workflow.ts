import type { CommandRequestStatus } from "./auth/types";

export const staffQueuePollIntervalMs = 5000;
export type StaffQueueBucket = "active" | "completed";

const completedStatuses = new Set<CommandRequestStatus>(["COMPLETED", "RESOLVED", "CANCELLED"]);

const staffNextStatus: Partial<Record<CommandRequestStatus, CommandRequestStatus>> = {
  NEW: "ACKNOWLEDGED",
  ACKNOWLEDGED: "IN_PROGRESS",
  ASSIGNED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED"
};

export function getStaffNextStatus(status: CommandRequestStatus) {
  return staffNextStatus[status] ?? null;
}

export function getStaffQueueBucket(status: CommandRequestStatus): StaffQueueBucket {
  return completedStatuses.has(status) ? "completed" : "active";
}

export function summarizeStaffQueueBuckets<T extends { status: CommandRequestStatus }>(requests: T[]) {
  return requests.reduce(
    (summary, request) => {
      if (getStaffQueueBucket(request.status) === "active") {
        summary.activeCount += 1;
      } else {
        summary.completedCount += 1;
      }

      return summary;
    },
    { activeCount: 0, completedCount: 0 }
  );
}
