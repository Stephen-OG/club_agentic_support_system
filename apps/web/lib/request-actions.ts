import { createCancelledReply, createSatisfactionReply, createServiceRecoveryReply } from "./chat-copy";
import type { RequestStatus } from "./chat-copy";
import { normalizeSatisfactionRating } from "@madupe/shared";

export type ClientRequestAction = "cancel" | "confirm_resolved" | "not_satisfied";
export type SatisfactionRating = 1 | 2 | 3 | 4 | 5;

export type ClientActionResult =
  | {
      allowed: true;
      status: "cancelled" | "resolved" | "in_progress";
      message: string;
      satisfactionRating: SatisfactionRating | null;
    }
  | { allowed: false; error: string };

export function getClientActionResult(
  action: ClientRequestAction,
  currentStatus: RequestStatus | string,
  rating?: unknown
): ClientActionResult {
  if (action === "cancel") {
    if (currentStatus === "completed" || currentStatus === "resolved" || currentStatus === "cancelled") {
      return { allowed: false, error: "This request can no longer be cancelled" };
    }

    return {
      allowed: true,
      status: "cancelled",
      satisfactionRating: null,
      message: createCancelledReply()
    };
  }

  if (action === "confirm_resolved") {
    if (currentStatus !== "completed") {
      return { allowed: false, error: "This request is not awaiting satisfaction confirmation" };
    }

    const satisfactionRating = normalizeSatisfactionRating(rating);
    if (!satisfactionRating) {
      return { allowed: false, error: "A satisfaction rating from 1 to 5 is required" };
    }

    return {
      allowed: true,
      status: "resolved",
      satisfactionRating,
      message: createSatisfactionReply(satisfactionRating)
    };
  }

  if (currentStatus !== "completed") {
    return { allowed: false, error: "This request is not awaiting satisfaction confirmation" };
  }

  return {
    allowed: true,
    status: "in_progress",
    satisfactionRating: null,
    message: createServiceRecoveryReply()
  };
}


