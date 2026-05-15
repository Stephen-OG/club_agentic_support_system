"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Building2, LayoutDashboard, RadioTower, Settings, UserCheck, Users } from "lucide-react";
import { AccountCommand } from "./components/account-command";
import { CommandCenterDashboard } from "./components/command-center-dashboard";
import { OperationsCommand } from "./components/operations-command";
import { StaffDashboard } from "./components/staff-dashboard";
import { TeamCommand } from "./components/team-command";
import { VenuesCommand } from "./components/venues-command";
import type { CommandView } from "@/lib/auth/role-policy";
import { getPrimaryMembership, getRoleDashboardMode, getVisibleCommandViews } from "@/lib/auth/role-policy";
import type { CommandUser } from "@/lib/auth/types";

const iconByView: Record<CommandView, LucideIcon> = {
  dashboard: LayoutDashboard,
  operations: RadioTower,
  team: Users,
  venues: Building2,
  staff: UserCheck,
  account: Settings
};

export function AppShell({ currentUser }: { currentUser: CommandUser }) {
  const defaultView = getRoleDashboardMode(currentUser) === "staff" ? "staff" : "dashboard";
  const [view, setView] = useState<CommandView>(defaultView);
  const visibleViews = useMemo(() => getVisibleCommandViews(currentUser), [currentUser]);
  const visibleViewIds = useMemo(() => new Set(visibleViews.map((item) => item.id)), [visibleViews]);
  const primaryMembership = getPrimaryMembership(currentUser);

  useEffect(() => {
    if (!visibleViewIds.has(view)) {
      setView(defaultView);
    }
  }, [defaultView, view, visibleViewIds]);

  return (
    <main className="command-shell">
      <aside className="command-sidebar">
        <div className="command-brand">
          <span className="command-mark">
            <Activity size={18} />
          </span>
          <div>
            <strong>GuestOS</strong>
            <span>Command Center</span>
          </div>
        </div>
        <nav aria-label="Command center navigation">
          {visibleViews.map((item) => {
            const Icon = iconByView[item.id];
            return (
              <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="live-pill">{primaryMembership?.role.replace("_", " ") || "Profile"}</span>
          <small>{primaryMembership?.venue?.name || primaryMembership?.workspace.name || "Workspace access"}.</small>
        </div>
      </aside>
      <section className="command-main">
        {view === "dashboard" ? <CommandCenterDashboard /> : null}
        {view === "operations" ? <OperationsCommand /> : null}
        {view === "team" ? <TeamCommand /> : null}
        {view === "venues" ? <VenuesCommand /> : null}
        {view === "staff" ? <StaffDashboard currentUser={currentUser} /> : null}
        {view === "account" ? <AccountCommand /> : null}
      </section>
    </main>
  );
}
