import type { CommandRequestPriority } from "./auth/types";

export type VisibleRequestPriority = "NORMAL" | "HIGH" | "URGENT";

export const visibleRequestPriorities: VisibleRequestPriority[] = ["NORMAL", "HIGH", "URGENT"];

export function getVisibleRequestPriority(priority: CommandRequestPriority | string): VisibleRequestPriority {
  if (priority === "URGENT") {
    return "URGENT";
  }

  if (priority === "HIGH") {
    return "HIGH";
  }

  return "NORMAL";
}

export function getPriorityLabel(priority: CommandRequestPriority | string) {
  const visiblePriority = getVisibleRequestPriority(priority);
  return visiblePriority.charAt(0) + visiblePriority.slice(1).toLowerCase();
}

export function getPriorityClassName(priority: CommandRequestPriority | string) {
  return getPriorityLabel(priority).toLowerCase();
}
