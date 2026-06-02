"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Activity, Building2, LayoutDashboard, LogOut, RadioTower, Settings, UserCheck, Users } from "lucide-react";
import { AccountCommand } from "./components/account-command";
import { CommandCenterDashboard } from "./components/command-center-dashboard";
import { OperationsCommand } from "./components/operations-command";
import { StaffDashboard } from "./components/staff-dashboard";
import { TeamCommand } from "./components/team-command";
import { VenuesCommand } from "./components/venues-command";
import type { CommandView } from "@/lib/auth/role-policy";
import { getCommandViewHref, getPrimaryMembership, getRoleDashboardMode, getVisibleCommandViews, resolveCommandView } from "@/lib/auth/role-policy";
import type { CommandUser } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const iconByView: Record<CommandView, LucideIcon> = {
  dashboard: LayoutDashboard,
  operations: RadioTower,
  team: Users,
  venues: Building2,
  staff: UserCheck,
  account: Settings
};

export function AppShell({ currentUser, initialView }: { currentUser: CommandUser; initialView?: CommandView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const defaultView = getRoleDashboardMode(currentUser) === "staff" ? "staff" : "dashboard";
  const visibleViews = useMemo(() => getVisibleCommandViews(currentUser), [currentUser]);
  const requestedView = searchParams.get("view");
  const startingView = resolveCommandView(currentUser, requestedView, initialView || defaultView);
  const [view, setView] = useState<CommandView>(startingView);
  const primaryMembership = getPrimaryMembership(currentUser);

  async function signOut() {
    if (!supabase) {
      window.location.reload();
      return;
    }

    await supabase.auth.signOut();
    window.location.reload();
  }

  useEffect(() => {
    const nextView = resolveCommandView(currentUser, requestedView, initialView || defaultView);

    if (view !== nextView) {
      setView(nextView);
    }
  }, [currentUser, defaultView, initialView, requestedView, view]);

  function selectView(nextView: CommandView) {
    setView(nextView);
    router.replace(getCommandViewHref(pathname, nextView), { scroll: false });
  }

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
              <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => selectView(item.id)} type="button">
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="live-pill">{primaryMembership?.role.replace("_", " ") || "Profile"}</span>
          <small>{primaryMembership?.venue?.name || primaryMembership?.workspace.name || "Workspace access"}.</small>
          <button className="command-button danger" onClick={signOut} type="button">
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
      <section className="command-main">
        {view === "dashboard" ? <CommandCenterDashboard /> : null}
        {view === "operations" ? <OperationsCommand /> : null}
        {view === "team" ? <TeamCommand currentUser={currentUser} /> : null}
        {view === "venues" ? <VenuesCommand /> : null}
        {view === "staff" ? <StaffDashboard currentUser={currentUser} /> : null}
        {view === "account" ? <AccountCommand currentUser={currentUser} /> : null}
      </section>
    </main>
  );
}
