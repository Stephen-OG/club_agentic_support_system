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
  owner: 6,
  admin: 5,
  manager: 4,
  security: 3,
  staff: 2,
  read_only: 1
};

const visibleViewsByRole: Record<CommandRole, CommandView[]> = {
  owner: ["dashboard", "operations", "team", "venues", "account"],
  admin: ["dashboard", "operations", "team", "venues", "account"],
  manager: ["dashboard", "operations", "venues", "account"],
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
