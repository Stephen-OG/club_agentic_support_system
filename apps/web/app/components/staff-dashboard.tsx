"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LogOut, Play, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { getPrimaryMembership, getPrimaryRole } from "@/lib/auth/role-policy";
import type { CommandRequestStatus, CommandSupportRequest, CommandUser } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const staffNextStatus: Partial<Record<CommandRequestStatus, CommandRequestStatus>> = {
  ACKNOWLEDGED: "IN_PROGRESS",
  ASSIGNED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED"
};

function label(value: string) {
  return value.toLowerCase().replace("_", " ");
}

function sharedStatus(status: CommandRequestStatus) {
  return status.toLowerCase() as Lowercase<CommandRequestStatus>;
}

function canAct(user: CommandUser) {
  return ["staff", "security"].includes(getPrimaryRole(user));
}

export function StaffDashboard({ currentUser }: { currentUser: CommandUser }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const membership = getPrimaryMembership(currentUser);
  const venueId = membership?.venueId ?? "";
  const venueName = membership?.venue?.name || "Assigned venue";
  const canUpdateRequests = canAct(currentUser);
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(venueId));
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function refresh() {
    if (!supabase || !venueId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setRequests(await apiRequest<CommandSupportRequest[]>(supabase, `/venues/${venueId}/requests`));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load your queue");
    } finally {
      setLoading(false);
    }
  }

  async function updateRequest(request: CommandSupportRequest, status: CommandRequestStatus) {
    if (!supabase || !canUpdateRequests) {
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

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.reload();
  }

  useEffect(() => {
    if (!supabase || !venueId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void apiRequest<CommandSupportRequest[]>(supabase, `/venues/${venueId}/requests`)
      .then((nextRequests) => {
        if (!cancelled) {
          setRequests(nextRequests);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load your queue");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, venueId]);

  const activeRequests = requests.filter((request) => !["RESOLVED", "CANCELLED"].includes(request.status));
  const readyRequests = activeRequests.filter((request) => request.status === "ACKNOWLEDGED" || request.status === "ASSIGNED");
  const inProgressRequests = activeRequests.filter((request) => request.status === "IN_PROGRESS");
  const completedRequests = requests.filter((request) => request.status === "COMPLETED" || request.status === "RESOLVED");
  const metrics = [
    { label: "Open tasks", value: activeRequests.length.toString(), detail: venueName, icon: UserCheck },
    { label: "Ready", value: readyRequests.length.toString(), detail: "waiting to start", icon: Play },
    { label: "In progress", value: inProgressRequests.length.toString(), detail: "currently owned", icon: Clock3 },
    { label: "Completed", value: completedRequests.length.toString(), detail: "guest confirmation flow", icon: CheckCircle2 }
  ];

  if (!venueId) {
    return (
      <section className="command-grid">
        <div className="command-heading">
          <div>
            <div className="eyebrow">Staff workspace</div>
            <h1>Staff Dashboard</h1>
          </div>
          <button className="command-button danger" onClick={signOut} type="button">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
        <div className="command-panel wide">
          <div className="empty-state">
            <ShieldCheck size={28} />
            <h2>No assigned venue</h2>
            <p>Your account is active, but it is not attached to a venue queue yet.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Staff workspace</div>
          <h1>Staff Dashboard</h1>
        </div>
        <div className="button-row">
          <button className="command-button" disabled={loading} onClick={() => void refresh()} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="command-button danger" onClick={signOut} type="button">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
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
          <h2>{venueName} queue</h2>
          <span className="data-chip">{canUpdateRequests ? "Action enabled" : "Read only"}</span>
        </div>
        <div className="staff-task-list">
          {activeRequests.map((request) => {
            const nextStatus = canUpdateRequests ? staffNextStatus[request.status] : undefined;
            return (
              <article className="staff-task" key={request.id}>
                <div className="request-main">
                  <span className={`severity-dot severity-${label(request.priority)}`} />
                  <div>
                    <strong>{request.title}</strong>
                    <span>{request.servicePoint?.label || "Service point"} · {request.summary || request.category}</span>
                  </div>
                </div>
                <div className="pill-row compact">
                  <span className={`pill priority-${label(request.priority)}`}>{label(request.priority)}</span>
                  <span className={`pill status-${sharedStatus(request.status)}`}>{label(request.status)}</span>
                </div>
                {nextStatus ? (
                  <button
                    className="command-button primary"
                    disabled={updatingId === request.id}
                    onClick={() => void updateRequest(request, nextStatus)}
                    type="button"
                  >
                    {label(nextStatus)}
                  </button>
                ) : null}
              </article>
            );
          })}
          {!activeRequests.length && !loading ? <div className="empty-state">No active tasks in your queue.</div> : null}
        </div>
      </div>
    </section>
  );
}
