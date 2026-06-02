"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Bell, Clock3, MessageSquareText, RadioTower, RefreshCw, ShieldAlert, Star } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandRequestStatus, CommandSupportRequest, CommandVenue } from "@/lib/auth/types";
import { playDefaultRequestNotificationSound } from "@/lib/default-notification-sound";
import { calculateOperationsAnalytics } from "@/lib/operations-analytics";
import {
  type OperationsBucket,
  getOperationsNotifications,
  getOperationsBucket,
  getOperationsStatusTone,
  getRequestOperationAction,
  mergeOperationRequestUpdate,
  operationsPollIntervalMs,
  summarizeOperationsBuckets
} from "@/lib/operations-workflow";
import { calculateRatingAnalytics } from "@/lib/rating-analytics";
import { connectStaffVenueEvents } from "@/lib/realtime-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function statusLabel(status: string) {
  return status.toLowerCase().replace("_", " ");
}

function sharedStatus(status: CommandRequestStatus) {
  return status.toLowerCase() as Lowercase<CommandRequestStatus>;
}

function priorityClass(priority: string) {
  return priority.toLowerCase();
}

function ratingLabel(request: CommandSupportRequest) {
  if (request.satisfactionRating) {
    return `${request.satisfactionRating}/5`;
  }

  if (request.status === "COMPLETED" || request.status === "RESOLVED") {
    return "Not rated";
  }

  return "Awaiting completion";
}

function latestPreview(request: CommandSupportRequest) {
  return request.recentMessages?.at(-1)?.body || request.summary || "No conversation preview yet.";
}

export function OperationsCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRequestsRef = useRef(false);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<OperationsBucket>("active");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(window.Notification.permission);
    }
  }, []);

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

  const notifyForNewRequests = useCallback((nextRequests: CommandSupportRequest[]) => {
    if (!hasLoadedRequestsRef.current) {
      knownRequestIdsRef.current = new Set(nextRequests.map((request) => request.id));
      hasLoadedRequestsRef.current = true;
      return;
    }

    const notifications = getOperationsNotifications(knownRequestIdsRef.current, nextRequests);
    knownRequestIdsRef.current = new Set(nextRequests.map((request) => request.id));

    if (notifications.length > 0) {
      void playDefaultRequestNotificationSound();
    }

    if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") {
      return;
    }

    for (const notification of notifications) {
      new window.Notification(notification.title, {
        body: notification.body,
        tag: notification.id
      });
    }
  }, []);

  const loadRequests = useCallback(async (venueId: string) => {
    if (!supabase || !venueId) {
      setRequests([]);
      return;
    }

    try {
      const nextRequests = await apiRequest<CommandSupportRequest[]>(supabase, `/venues/${venueId}/requests`);
      notifyForNewRequests(nextRequests);
      setRequests(nextRequests);
      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch {
      // Poll failures are expected when the session token rotates;
      // the manual Refresh button still surfaces errors to the user.
    }
  }, [notifyForNewRequests, supabase]);

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

  async function patchRequestStatus(request: CommandSupportRequest, status: CommandRequestStatus) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return null;
    }

    const updated = await apiRequest<CommandSupportRequest>(supabase, `/requests/${request.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: sharedStatus(status) })
    });

    setRequests((current) => current.map((item) => (item.id === updated.id ? mergeOperationRequestUpdate(item, updated) : item)));
    return updated;
  }

  async function applyRequestAction(request: CommandSupportRequest) {
    const action = getRequestOperationAction(request.status);

    if (!action) {
      return;
    }

    setUpdatingId(request.id);
    setError(null);

    try {
      let updated = request;

      if (action.requiresInProgressFirst && updated.status !== "IN_PROGRESS") {
        updated = (await patchRequestStatus(updated, "IN_PROGRESS")) ?? updated;
      }

      updated = (await patchRequestStatus(updated, action.targetStatus)) ?? updated;

      if (action.autoAdvanceToStatus && updated.status !== action.autoAdvanceToStatus) {
        await patchRequestStatus(updated, action.autoAdvanceToStatus);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update request");
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedVenueId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadRequests(selectedVenueId);
    }, operationsPollIntervalMs);
    const disconnectRealtime = supabase
      ? connectStaffVenueEvents({
          supabase,
          venueId: selectedVenueId,
          onEvent: () => {
            void loadRequests(selectedVenueId);
          }
        })
      : () => undefined;

    return () => {
      disconnectRealtime();
      window.clearInterval(intervalId);
    };
  }, [loadRequests, selectedVenueId, supabase]);

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError("Browser notifications are not supported here.");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
  }

  const bucketSummary = summarizeOperationsBuckets(requests);
  const selectedRequests = requests.filter((request) => getOperationsBucket(request.status) === activeBucket);
  const ratingAnalytics = calculateRatingAnalytics(requests);
  const operationsAnalytics = calculateOperationsAnalytics(requests);
  const ratingAverage = ratingAnalytics.averageRating === null ? "No ratings" : ratingAnalytics.averageRating.toFixed(1);
  const metrics = [
    { label: "Active queue", value: bucketSummary.activeCount.toString(), detail: `${requests.length} total`, tone: "ok", icon: RadioTower },
    {
      label: "Avg completion",
      value: operationsAnalytics.averageCompletionMinutes === null ? "None" : `${operationsAnalytics.averageCompletionMinutes}m`,
      detail: `${operationsAnalytics.slowRequestCount} slow`,
      tone: operationsAnalytics.slowRequestCount > 0 ? "warn" : "idle",
      icon: Clock3
    },
    { label: "Avg rating", value: ratingAverage, detail: `${ratingAnalytics.ratedCount} rated`, tone: "idle", icon: Star },
    { label: "Low ratings", value: ratingAnalytics.lowRatingCount.toString(), detail: "1-2 star recovery", tone: "warn", icon: ShieldAlert }
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
          <button className="command-button" disabled={notificationPermission === "granted"} onClick={() => void enableNotifications()} type="button">
            <Bell size={16} />
            {notificationPermission === "granted" ? "Notifications on" : "Enable alerts"}
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
            <h2>{activeBucket === "active" ? "Active requests" : "Completed requests"}</h2>
            {lastUpdatedAt ? <span className="data-chip">Updated {lastUpdatedAt}</span> : null}
            <div className="ops-tabs" role="tablist" aria-label="Request status buckets">
              <button
                aria-selected={activeBucket === "active"}
                className={`ops-tab ${activeBucket === "active" ? "active" : ""}`}
                onClick={() => setActiveBucket("active")}
                role="tab"
                type="button"
              >
                Active <span>{bucketSummary.activeCount}</span>
              </button>
              <button
                aria-selected={activeBucket === "completed"}
                className={`ops-tab ${activeBucket === "completed" ? "active" : ""}`}
                onClick={() => setActiveBucket("completed")}
                role="tab"
                type="button"
              >
                Completed <span>{bucketSummary.completedCount}</span>
              </button>
            </div>
          </div>
          <div className="analytics-strip">
            <div>
              <BarChart3 size={15} />
              <strong>Top categories</strong>
              <span>
                {operationsAnalytics.requestCountByCategory
                  .slice(0, 3)
                  .map((item) => `${item.category} ${item.count}`)
                  .join(" · ") || "No data yet"}
              </span>
            </div>
            <div>
              <Clock3 size={15} />
              <strong>Busiest hours</strong>
              <span>
                {operationsAnalytics.busiestHours.map((item) => `${item.hour} ${item.count}`).join(" · ") || "No data yet"}
              </span>
            </div>
            <div>
              <ShieldAlert size={15} />
              <strong>Unresolved</strong>
              <span>
                {operationsAnalytics.unresolvedCount} open · {operationsAnalytics.slowRequestCount} slow
              </span>
            </div>
          </div>
          <div className="queue-list">
            {selectedRequests.map((request) => {
              const action = getRequestOperationAction(request.status);
              const statusTone = getOperationsStatusTone(request.status);
              return (
                <article className={`request-row status-tone-${statusTone}`} key={request.id}>
                  <div className="request-main">
                    <span className={`severity-dot severity-${priorityClass(request.priority)}`} />
                    <div>
                      <strong>{request.title}</strong>
                      <span>{request.servicePoint?.label || "Service point"} · {request.category}</span>
                      <span className="request-preview">
                        <MessageSquareText size={13} />
                        {latestPreview(request)}
                      </span>
                      {request.guestLocationLabel ? <span className="request-preview">Location: {request.guestLocationLabel}</span> : null}
                    </div>
                  </div>
                  <div className="pill-row compact">
                    <span className={`pill priority-${priorityClass(request.priority)}`}>{priorityClass(request.priority)}</span>
                    <span className={`pill status-${sharedStatus(request.status)}`}>{statusLabel(request.status)}</span>
                    <span className={`pill rating-chip ${request.satisfactionRating && request.satisfactionRating <= 2 ? "low-rating" : ""}`}>
                      <Star size={12} />
                      {ratingLabel(request)}
                    </span>
                  </div>
                  {action ? (
                    <button
                      className="command-button"
                      disabled={updatingId === request.id}
                      onClick={() => void applyRequestAction(request)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ) : null}
                </article>
              );
            })}
            {!selectedRequests.length && !loading ? (
              <div className="empty-state">
                {activeBucket === "active" ? "No active requests for this venue." : "No completed requests for this venue."}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
