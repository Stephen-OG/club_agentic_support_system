import type { CommandView } from "./auth/role-policy";

export function getNextVisitedCommandViews(current: CommandView[], nextView: CommandView) {
  return current.includes(nextView) ? current : [...current, nextView];
}
