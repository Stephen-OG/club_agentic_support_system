"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, LogOut, Play, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { getPrimaryMembership, getPrimaryRole } from "@/lib/auth/role-policy";
import type { CommandRequestStatus, CommandSupportRequest, CommandUser } from "@/lib/auth/types";
import { getOperationsNotifications } from "@/lib/operations-workflow";
import { getPriorityClassName, getPriorityLabel } from "@/lib/priority-display";
import { connectStaffVenueEvents } from "@/lib/realtime-events";
import { deliverRequestNotificationAlerts, initializeRequestNotificationAlerts } from "@/lib/request-notification-alerts";
import {
  getStaffNextStatus,
  getStaffQueueBucket,
  staffQueuePollIntervalMs,
  summarizeStaffQueueBuckets,
  type StaffQueueBucket
} from "@/lib/staff-workflow";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";

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
  const authClient = useMemo(() => createBrowserAuthClient(), []);
  const membership = getPrimaryMembership(currentUser);
  const venueId = membership?.venueId ?? "";
  const venueName = membership?.venue?.name || "Assigned venue";
  const canUpdateRequests = canAct(currentUser);
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(venueId));
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<StaffQueueBucket>("active");
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRequestsRef = useRef(false);

  useEffect(() => {
    initializeRequestNotificationAlerts();
  }, []);

  const notifyForNewRequests = useCallback((nextRequests: CommandSupportRequest[]) => {
    if (!hasLoadedRequestsRef.current) {
      knownRequestIdsRef.current = new Set(nextRequests.map((request) => request.id));
      hasLoadedRequestsRef.current = true;
      return;
    }

    const notifications = getOperationsNotifications(knownRequestIdsRef.current, nextRequests);
    knownRequestIdsRef.current = new Set(nextRequests.map((request) => request.id));

    void deliverRequestNotificationAlerts(notifications);
  }, []);

  async function refresh() {
    if (!authClient || !venueId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextRequests = await apiRequest<CommandSupportRequest[]>(authClient, `/venues/${venueId}/requests`);
      notifyForNewRequests(nextRequests);
      setRequests(nextRequests);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load your queue");
    } finally {
      setLoading(false);
    }
  }

  async function updateRequest(request: CommandSupportRequest, status: CommandRequestStatus) {
    if (!authClient || !canUpdateRequests) {
      return;
    }

    setUpdatingId(request.id);
    setError(null);

    try {
      const updated = await apiRequest<CommandSupportRequest>(authClient, `/requests/${request.id}/status`, {
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
    await authClient?.auth.signOut();
    window.location.reload();
  }

  useEffect(() => {
    if (!authClient || !venueId) {
      setLoading(false);
      return;
    }

    const client = authClient;
    let cancelled = false;
    async function loadQueue(options: { showLoading: boolean }) {
      if (options.showLoading) {
        setLoading(true);
      }
      setError(null);

      try {
        const nextRequests = await apiRequest<CommandSupportRequest[]>(client, `/venues/${venueId}/requests`);
        if (!cancelled) {
          notifyForNewRequests(nextRequests);
          setRequests(nextRequests);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load your queue");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadQueue({ showLoading: true });
    const intervalId = window.setInterval(() => {
      void loadQueue({ showLoading: false });
    }, staffQueuePollIntervalMs);
    const disconnectRealtime = connectStaffVenueEvents({
      authClient: client,
      venueId,
      onEvent: () => {
        void loadQueue({ showLoading: false });
      }
    });

    return () => {
      cancelled = true;
      disconnectRealtime();
      window.clearInterval(intervalId);
    };
  }, [notifyForNewRequests, authClient, venueId]);

  const bucketSummary = summarizeStaffQueueBuckets(requests);
  const activeRequests = requests.filter((request) => getStaffQueueBucket(request.status) === "active");
  const selectedRequests = requests.filter((request) => getStaffQueueBucket(request.status) === activeBucket);
  const readyRequests = activeRequests.filter((request) => request.status === "ACKNOWLEDGED" || request.status === "ASSIGNED");
  const inProgressRequests = activeRequests.filter((request) => request.status === "IN_PROGRESS");
  const metrics = [
    { label: "Open tasks", value: bucketSummary.activeCount.toString(), detail: venueName, icon: UserCheck },
    { label: "Ready", value: readyRequests.length.toString(), detail: "waiting to start", icon: Play },
    { label: "In progress", value: inProgressRequests.length.toString(), detail: "currently owned", icon: Clock3 },
    { label: "Completed", value: bucketSummary.completedCount.toString(), detail: "guest confirmation flow", icon: CheckCircle2 }
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
          <div className="command-actions">
            <div className="ops-tabs" aria-label="Queue bucket">
              <button
                className={`ops-tab ${activeBucket === "active" ? "active" : ""}`}
                onClick={() => setActiveBucket("active")}
                type="button"
              >
                Active <span>{bucketSummary.activeCount}</span>
              </button>
              <button
                className={`ops-tab ${activeBucket === "completed" ? "active" : ""}`}
                onClick={() => setActiveBucket("completed")}
                type="button"
              >
                Completed <span>{bucketSummary.completedCount}</span>
              </button>
            </div>
            <span className="data-chip">{canUpdateRequests ? "Action enabled" : "Read only"}</span>
          </div>
        </div>
        <div className="staff-task-list">
          {selectedRequests.map((request) => {
            const nextStatus = canUpdateRequests ? getStaffNextStatus(request.status) : null;
            return (
              <article className="staff-task" key={request.id}>
                <div className="request-main">
                  <span className={`severity-dot severity-${getPriorityClassName(request.priority)}`} />
                  <div>
                    <strong>{request.title}</strong>
                    <span>{request.qrPoint?.label || "Service point"} · {request.summary || request.category}</span>
                  </div>
                </div>
                <div className="pill-row compact">
                  <span className={`pill priority-${getPriorityClassName(request.priority)}`}>{getPriorityLabel(request.priority)}</span>
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
          {!selectedRequests.length && !loading ? (
            <div className="empty-state">
              {activeBucket === "active" ? "No active tasks in your queue." : "No completed tasks in this queue yet."}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
