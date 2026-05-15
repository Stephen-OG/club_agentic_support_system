"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BellRing, MapPinned, RefreshCw, Star } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandSupportRequest, CommandTeamMember, CommandVenue } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function label(value: string) {
  return value.toLowerCase().replace("_", " ");
}

export function CommandCenterDashboard() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [team, setTeam] = useState<CommandTeamMember[]>([]);
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const [nextVenues, nextTeam] = await Promise.all([
        apiRequest<CommandVenue[]>(supabase, "/admin/venues"),
        apiRequest<CommandTeamMember[]>(supabase, "/team")
      ]);
      const venueRequests = nextVenues[0]
        ? await apiRequest<CommandSupportRequest[]>(supabase, `/venues/${nextVenues[0].id}/requests`)
        : [];
      setVenues(nextVenues);
      setTeam(nextTeam);
      setRequests(venueRequests);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load command center");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeRequests = requests.filter((request) => !["RESOLVED", "CANCELLED"].includes(request.status));
  const highPriority = activeRequests.filter((request) => ["HIGH", "URGENT"].includes(request.priority));
  const metrics = [
    { label: "Active requests", value: activeRequests.length.toString(), detail: `${highPriority.length} high priority`, icon: BellRing },
    { label: "Venues", value: venues.length.toString(), detail: `${venues.reduce((sum, venue) => sum + venue.servicePoints.length, 0)} QR points`, icon: MapPinned },
    { label: "Team users", value: team.length.toString(), detail: "Supabase credentials", icon: Star },
    { label: "API state", value: loading ? "Sync" : "Live", detail: "Nest protected routes", icon: Activity }
  ];

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Operations overview</div>
          <h1>Command Center</h1>
        </div>
        <button className="command-button" disabled={loading} onClick={() => void refresh()} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error ? <div className="form-error wide">{error}</div> : null}

      <div className="metric-strip">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="command-metric" key={metric.label}>
              <Icon size={18} />
              <div>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
                <small>{metric.detail}</small>
              </div>
            </article>
          );
        })}
      </div>

      <div className="command-panel wide">
        <div className="panel-title-row">
          <h2>Priority queue</h2>
          <span className="data-chip">{venues[0]?.name || "No venue"}</span>
        </div>
        <div className="queue-list">
          {activeRequests.slice(0, 6).map((request) => (
            <div className="queue-row" key={request.id}>
              <span className={`severity-dot severity-${label(request.priority)}`} />
              <strong>{request.title}</strong>
              <span>{label(request.status)}</span>
            </div>
          ))}
          {!activeRequests.length && !loading ? <div className="empty-state">No active requests in the first venue queue.</div> : null}
        </div>
      </div>
    </section>
  );
}
