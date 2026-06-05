import type { RequestPriority } from "@madupe/shared";

export type AssignmentQueue = "bar" | "floor" | "kitchen" | "operations" | "security";

export type AssignmentRouteInput = {
  category?: string | null;
  message: string;
  priority: RequestPriority;
};

export type AssignmentRoute = {
  queue: AssignmentQueue;
  reason: string;
  requiresHumanAssignment: true;
};

const safetyPattern =
  /\b(allerg|assault|broken glass|chok|danger|emergency|fight|fire|harass|injur|medical|security|smoke|threat|unsafe)\b/i;
const barPattern = /\b(bar|beer|cocktail|drink|wine|shot)\b/i;
const kitchenPattern = /\b(food|meal|starter|main|dessert|kitchen|order|missing|wrong|cold|undercooked)\b/i;
const facilitiesPattern = /\b(bathroom|clean|glass|leak|napkin|restroom|spill|toilet|water)\b/i;

export function determineAssignmentRoute(input: AssignmentRouteInput): AssignmentRoute {
  const category = input.category?.trim().toLowerCase() || "";
  const message = input.message.trim().toLowerCase();
  const text = `${category} ${message}`;

  if (input.priority === "urgent" || safetyPattern.test(text)) {
    return {
      queue: "security",
      reason: "urgent safety/security routing",
      requiresHumanAssignment: true
    };
  }

  if (kitchenPattern.test(text)) {
    return {
      queue: "floor",
      reason: "guest service/order follow-up",
      requiresHumanAssignment: true
    };
  }

  if (barPattern.test(text)) {
    return {
      queue: "bar",
      reason: "bar service request",
      requiresHumanAssignment: true
    };
  }

  if (facilitiesPattern.test(text)) {
    return {
      queue: "operations",
      reason: "venue facilities support",
      requiresHumanAssignment: true
    };
  }

  return {
    queue: "floor",
    reason: "general guest support",
    requiresHumanAssignment: true
  };
}
