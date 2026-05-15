"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RadioTower, RefreshCw, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandRequestStatus, CommandSupportRequest, CommandVenue } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const nextStatusByStatus: Partial<Record<CommandRequestStatus, CommandRequestStatus>> = {
  NEW: "ACKNOWLEDGED",
  ACKNOWLEDGED: "IN_PROGRESS",
  ASSIGNED: "IN_PROGRESS",
  ESCALATED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "RESOLVED"
};

function statusLabel(status: string) {
  return status.toLowerCase().replace("_", " ");
}

function sharedStatus(status: CommandRequestStatus) {
  return status.toLowerCase() as Lowercase<CommandRequestStatus>;
}

function priorityClass(priority: string) {
  return priority.toLowerCase();
}

export function OperationsCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadVenues = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return [];
    }

    const nextVenues = await apiRequest<CommandVenue[]>(supabase, "/admin/venues");
    setVenues(nextVenues);
    setSelectedVenueId((current) => current || nextVenues[0]?.id || "");
    return nextVenues;
  }, [supabase]);

  const loadRequests = useCallback(async (venueId: string) => {
    if (!supabase || !venueId) {
      setRequests([]);
      return;
    }

    setRequests(await apiRequest<CommandSupportRequest[]>(supabase, `/venues/${venueId}/requests`));
  }, [supabase]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextVenues = venues.length ? venues : await loadVenues();
      const venueId = selectedVenueId || nextVenues[0]?.id || "";
      await loadRequests(venueId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load operations");
    } finally {
      setLoading(false);
    }
  }, [loadRequests, loadVenues, selectedVenueId, venues]);

  async function updateRequest(request: CommandSupportRequest, status: CommandRequestStatus) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setUpdatingId(request.id);
    setError(null);

    try {
      const updated = await apiRequest<CommandSupportRequest>(supabase, `/requests/${request.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: sharedStatus(status) })
      });
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update request");
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openRequests = requests.filter((request) => !["RESOLVED", "CANCELLED"].includes(request.status));
  const urgentRequests = requests.filter((request) => request.priority === "URGENT" || request.status === "ESCALATED");
  const completedToday = requests.filter((request) => request.status === "COMPLETED" || request.status === "RESOLVED");
  const activeVenue = venues.find((venue) => venue.id === selectedVenueId);
  const metrics = [
    { label: "Open queue", value: openRequests.length.toString(), detail: `${requests.length} total`, tone: "ok", icon: RadioTower },
    { label: "Escalations", value: urgentRequests.length.toString(), detail: "needs command attention", tone: "warn", icon: ShieldAlert },
    { label: "Completed", value: completedToday.length.toString(), detail: "awaiting confirmation", tone: "ok", icon: CheckCircle2 },
    { label: "Venue", value: activeVenue ? "Live" : "None", detail: activeVenue?.name || "No venue selected", tone: "idle", icon: Clock3 }
  ];

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Live operations</div>
          <h1>Operations</h1>
        </div>
        <div className="command-actions">
          <select className="command-select" onChange={(event) => setSelectedVenueId(event.target.value)} value={selectedVenueId}>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <button className="command-button" disabled={loading} onClick={() => void refresh()} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="form-error wide">{error}</div> : null}

      <div className="metric-strip">
        {metrics.map((item) => {
          const Icon = item.icon;
          return (
            <article className={`command-metric ops-${item.tone}`} key={item.label}>
              <Icon size={18} />
              <div>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
                <small>{item.detail}</small>
              </div>
            </article>
          );
        })}
      </div>

      <div className="ops-layout">
        <section className="command-panel">
          <div className="panel-title-row">
            <h2>Priority handoffs</h2>
            <span className="data-chip">{openRequests.length} open</span>
          </div>
          <div className="queue-list">
            {openRequests.map((request) => {
              const nextStatus = nextStatusByStatus[request.status];
              return (
                <article className="request-row" key={request.id}>
                  <div className="request-main">
                    <span className={`severity-dot severity-${priorityClass(request.priority)}`} />
                    <div>
                      <strong>{request.title}</strong>
                      <span>{request.servicePoint?.label || "Service point"} · {request.category}</span>
                    </div>
                  </div>
                  <div className="pill-row compact">
                    <span className={`pill priority-${priorityClass(request.priority)}`}>{priorityClass(request.priority)}</span>
                    <span className={`pill status-${sharedStatus(request.status)}`}>{statusLabel(request.status)}</span>
                  </div>
                  {nextStatus ? (
                    <button
                      className="command-button"
                      disabled={updatingId === request.id}
                      onClick={() => void updateRequest(request, nextStatus)}
                      type="button"
                    >
                      {statusLabel(nextStatus)}
                    </button>
                  ) : null}
                </article>
              );
            })}
            {!openRequests.length && !loading ? <div className="empty-state">No active requests for this venue.</div> : null}
          </div>
        </section>

        <section className="command-panel ops-incident-panel">
          <span className="ops-incident-icon">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2>Control state</h2>
            <p className="meta">Request reads and lifecycle updates now go through the Nest API with Supabase staff authorization.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
