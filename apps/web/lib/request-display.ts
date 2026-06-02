import type { CommandRequestStatus } from "./auth/types";

function titleCaseStatus(status: CommandRequestStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function createGuestRequestStatusLabel(status: CommandRequestStatus | null | undefined) {
  if (!status) {
    return "Ready";
  }

  if (status === "ACKNOWLEDGED" || status === "IN_PROGRESS") {
    return "In Progress";
  }

  if (status === "RESOLVED") {
    return "Complete";
  }

  if (status === "COMPLETED") {
    return "Awaiting rating";
  }

  return titleCaseStatus(status);
}

export function createCommandRequestStatusLabel(status: CommandRequestStatus) {
  return titleCaseStatus(status);
}
