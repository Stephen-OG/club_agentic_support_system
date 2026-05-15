"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Building2, LayoutDashboard, RadioTower, Settings, Users } from "lucide-react";
import { AccountCommand } from "./components/account-command";
import { CommandCenterDashboard } from "./components/command-center-dashboard";
import { OperationsCommand } from "./components/operations-command";
import { TeamCommand } from "./components/team-command";
import { VenuesCommand } from "./components/venues-command";

type View = "dashboard" | "operations" | "team" | "venues" | "account";

const navItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "operations", label: "Operations", icon: RadioTower },
  { id: "team", label: "Team", icon: Users },
  { id: "venues", label: "Venues", icon: Building2 },
  { id: "account", label: "Account", icon: Settings }
];

export function AppShell() {
  const [view, setView] = useState<View>("dashboard");

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
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="live-pill">Live service</span>
          <small>Workspace access enforced by API.</small>
        </div>
      </aside>
      <section className="command-main">
        {view === "dashboard" ? <CommandCenterDashboard /> : null}
        {view === "operations" ? <OperationsCommand /> : null}
        {view === "team" ? <TeamCommand /> : null}
        {view === "venues" ? <VenuesCommand /> : null}
        {view === "account" ? <AccountCommand /> : null}
      </section>
    </main>
  );
}
