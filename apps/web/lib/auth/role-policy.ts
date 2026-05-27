import type { CommandMembership, CommandRole, CommandUser } from "./types";

export type CommandView = "dashboard" | "operations" | "team" | "venues" | "staff" | "account";
export type RoleDashboardMode = "command" | "staff";

export const commandViews: Array<{ id: CommandView; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "operations", label: "Operations" },
  { id: "team", label: "Team" },
  { id: "venues", label: "Venues" },
  { id: "staff", label: "Staff" },
  { id: "account", label: "Account" }
];

const roleRank: Record<CommandRole, number> = {
  admin: 6,
  owner: 5,
  manager: 4,
  security: 3,
  staff: 2,
  read_only: 1
};

const visibleViewsByRole: Record<CommandRole, CommandView[]> = {
  owner: ["dashboard", "operations", "team", "venues", "account"],
  admin: ["dashboard", "operations", "team", "venues", "account"],
  manager: ["dashboard", "operations", "team", "venues", "account"],
  security: ["staff", "account"],
  staff: ["staff", "account"],
  read_only: ["staff", "account"]
};

export function getPrimaryMembership(user: CommandUser): CommandMembership | null {
  return [...user.memberships].sort((left, right) => roleRank[right.role] - roleRank[left.role])[0] ?? null;
}

export function getPrimaryRole(user: CommandUser): CommandRole {
  return getPrimaryMembership(user)?.role ?? "read_only";
}

export function hasCommandDashboardAccess(user: CommandUser) {
  return user.memberships.some((membership) => membership.role === "owner" || membership.role === "admin" || membership.role === "manager");
}

export function getRoleDashboardMode(user: CommandUser): RoleDashboardMode {
  return hasCommandDashboardAccess(user) ? "command" : "staff";
}

export function getVisibleCommandViews(user: CommandUser) {
  const role = getPrimaryRole(user);
  const visibleIds = new Set(visibleViewsByRole[role]);
  return commandViews.filter((view) => visibleIds.has(view.id));
}

export function isCommandView(value: string | null | undefined): value is CommandView {
  return commandViews.some((view) => view.id === value);
}

export function resolveCommandView(user: CommandUser, requestedView: string | null | undefined, fallbackView: CommandView) {
  const visibleIds = new Set(getVisibleCommandViews(user).map((view) => view.id));

  if (isCommandView(requestedView) && visibleIds.has(requestedView)) {
    return requestedView;
  }

  return visibleIds.has(fallbackView) ? fallbackView : getRoleDashboardMode(user) === "staff" ? "staff" : "dashboard";
}

export function getCommandViewHref(pathname: string, view: CommandView) {
  const params = new URLSearchParams();
  params.set("view", view);
  return `${pathname}?${params.toString()}`;
}
