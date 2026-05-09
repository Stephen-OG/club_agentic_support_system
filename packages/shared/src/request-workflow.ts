export const requestStatuses = [
  "new",
  "acknowledged",
  "assigned",
  "declined",
  "in_progress",
  "completed",
  "resolved",
  "cancelled",
  "escalated"
] as const;

export const staffRoles = ["owner", "manager", "admin", "staff", "security", "read_only"] as const;

export type RequestStatus = (typeof requestStatuses)[number];
export type StaffRole = (typeof staffRoles)[number];
export type RequestActor = "admin" | "manager" | "staff" | "guest" | "system";
export type GuestRequestAction = "cancel" | "confirm_resolved" | "not_satisfied";

const allowedTransitions: Record<RequestActor, Partial<Record<RequestStatus, RequestStatus[]>>> = {
  admin: {
    new: ["acknowledged", "assigned", "cancelled", "escalated"],
    acknowledged: ["assigned", "in_progress", "declined", "cancelled", "escalated"],
    assigned: ["in_progress", "declined", "cancelled", "escalated"],
    declined: ["assigned", "cancelled"],
    in_progress: ["completed", "cancelled", "escalated"],
    completed: ["in_progress", "resolved"],
    escalated: ["assigned", "in_progress", "cancelled", "resolved"]
  },
  manager: {
    new: ["acknowledged", "assigned", "cancelled", "escalated"],
    acknowledged: ["assigned", "in_progress", "declined", "cancelled", "escalated"],
    assigned: ["in_progress", "declined", "cancelled", "escalated"],
    declined: ["assigned", "cancelled"],
    in_progress: ["completed", "cancelled", "escalated"],
    completed: ["in_progress", "resolved"],
    escalated: ["assigned", "in_progress", "cancelled", "resolved"]
  },
  staff: {
    acknowledged: ["in_progress", "declined"],
    assigned: ["in_progress", "declined"],
    in_progress: ["completed"]
  },
  guest: {
    new: ["cancelled"],
    acknowledged: ["cancelled"],
    assigned: ["cancelled"],
    declined: ["cancelled"],
    in_progress: ["cancelled"],
    completed: ["resolved", "in_progress"]
  },
  system: {
    new: ["escalated"],
    acknowledged: ["escalated"],
    assigned: ["escalated"],
    in_progress: ["escalated"]
  }
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus, actor: RequestActor) {
  return allowedTransitions[actor][from]?.includes(to) ?? false;
}

export function getNextGuestActionStatus(current: RequestStatus, action: GuestRequestAction): RequestStatus {
  if (action === "cancel") {
    if (["completed", "resolved", "cancelled"].includes(current)) {
      throw new Error("This request can no longer be cancelled");
    }
    return "cancelled";
  }

  if (current !== "completed") {
    throw new Error("This request is not awaiting satisfaction confirmation");
  }

  return action === "confirm_resolved" ? "resolved" : "in_progress";
}
