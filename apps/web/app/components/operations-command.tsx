"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Clock3, MapPin, MessageSquareText, RadioTower, RefreshCw, ShieldAlert, SlidersHorizontal, Star, X } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { getPrimaryMembership, getPrimaryRole } from "@/lib/auth/role-policy";
import type { CommandRequestStatus, CommandSupportRequest, CommandUser, CommandVenue } from "@/lib/auth/types";
import { initializeDefaultRequestNotificationSound, playDefaultRequestNotificationSound } from "@/lib/default-notification-sound";
import {
  type OperationsDateRange,
  type OperationsFilters,
  type OperationsSortBy,
  type OperationsSortDirection,
  type OperationsVisiblePriority,
  defaultOperationsFilters,
  getOperationsFilterChips,
  getOperationsFilterOptions,
  getOperationsPriorityLabel,
  hasActiveOperationsFilters,
  runOperationsFilterPipeline
} from "@/lib/operations-filters";
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
import { getPriorityClassName, getPriorityLabel } from "@/lib/priority-display";
import { calculateRatingAnalytics } from "@/lib/rating-analytics";
import { connectStaffVenueEvents } from "@/lib/realtime-events";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function sharedStatus(status: CommandRequestStatus) {
  return status.toLowerCase() as Lowercase<CommandRequestStatus>;
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

function formatRequestAge(createdAt: string) {
  const created = new Date(createdAt);
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));

  if (Number.isNaN(created.getTime())) {
    return "Time unavailable";
  }

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m waiting`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes ? `${hours}h ${minutes}m waiting` : `${hours}h waiting`;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const dateRangeOptions: Array<{ label: string; value: OperationsDateRange }> = [
  { label: "All dates", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "Custom date range", value: "custom" }
];

const priorityOptions: OperationsVisiblePriority[] = ["NORMAL", "HIGH", "URGENT"];

const sortOptions: Array<{ label: string; value: OperationsSortBy }> = [
  { label: "Queue order", value: "queue" },
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Priority", value: "priority" },
  { label: "Rating", value: "rating" },
  { label: "Table number", value: "table" },
  { label: "Longest wait time", value: "wait" }
];

const sortDirectionOptions: Array<{ label: string; value: OperationsSortDirection }> = [
  { label: "Ascending", value: "asc" },
  { label: "Descending", value: "desc" }
];

function toggleValue<TValue extends string>(values: TValue[], value: TValue) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function OperationsCommand({ currentUser }: { currentUser: CommandUser }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const primaryRole = getPrimaryRole(currentUser);
  const primaryMembership = getPrimaryMembership(currentUser);
  const primaryVenueId = primaryMembership?.venueId;
  const primaryVenueName = primaryMembership?.venue?.name;
  const canSwitchVenues = primaryRole === "owner" || primaryRole === "admin";
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRequestsRef = useRef(false);
  const hasLoadedOperationsRef = useRef(false);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<OperationsBucket>("active");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [filters, setFilters] = useState<OperationsFilters>(defaultOperationsFilters);
  const [draftFilters, setDraftFilters] = useState<OperationsFilters>(defaultOperationsFilters);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(window.Notification.permission);
    }
    initializeDefaultRequestNotificationSound();
  }, []);

  const loadVenues = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return [];
    }

    const nextVenues = await apiRequest<CommandVenue[]>(supabase, "/admin/venues");
    setVenues(nextVenues);
    setSelectedVenueId((current) => current || primaryVenueId || nextVenues[0]?.id || "");
    return nextVenues;
  }, [primaryVenueId, supabase]);

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
      const venueId = selectedVenueId || primaryVenueId || nextVenues[0]?.id || "";
      await loadRequests(venueId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load operations");
    } finally {
      setLoading(false);
    }
  }, [loadRequests, loadVenues, primaryVenueId, selectedVenueId, venues]);

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
    if (hasLoadedOperationsRef.current) {
      return;
    }

    hasLoadedOperationsRef.current = true;
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
    initializeDefaultRequestNotificationSound();
    if (permission === "granted") {
      void playDefaultRequestNotificationSound();
    }
  }

  function changeVenue(venueId: string) {
    knownRequestIdsRef.current = new Set();
    hasLoadedRequestsRef.current = false;
    setRequests([]);
    setSelectedVenueId(venueId);
    void loadRequests(venueId);
  }

  function openFilterModal() {
    setDraftFilters(filters);
    setIsFilterModalOpen(true);
  }

  function closeFilterModal() {
    setDraftFilters(filters);
    setIsFilterModalOpen(false);
  }

  function updateDraftFilters(patch: Partial<OperationsFilters>) {
    setDraftFilters((current) => ({ ...current, ...patch }));
  }

  function clearFilters() {
    setFilters(defaultOperationsFilters);
    setDraftFilters(defaultOperationsFilters);
    setIsFilterModalOpen(false);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setIsFilterModalOpen(false);
  }

  const operationsNow = new Date();
  const filteredRequests = runOperationsFilterPipeline(requests, filters, operationsNow);
  const bucketSummary = summarizeOperationsBuckets(filteredRequests);
  const selectedRequests = runOperationsFilterPipeline(
    requests.filter((request) => getOperationsBucket(request.status) === activeBucket),
    filters,
    operationsNow,
    activeBucket
  );
  const selectedVenueName = venues.find((venue) => venue.id === selectedVenueId)?.name || primaryVenueName || "Assigned venue";
  const filterOptions = getOperationsFilterOptions(requests);
  const activeFilterChips = getOperationsFilterChips(filters);
  const hasActiveFilters = hasActiveOperationsFilters(filters);
  const ratingAnalytics = calculateRatingAnalytics(filteredRequests);
  const operationsAnalytics = calculateOperationsAnalytics(filteredRequests);
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
          {canSwitchVenues && venues.length > 1 ? (
            <select className="command-select" onChange={(event) => changeVenue(event.target.value)} value={selectedVenueId}>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="data-chip venue-lock">
              <MapPin size={13} />
              {selectedVenueName}
            </span>
          )}
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
          <div className="operations-filter-bar">
            <button className="command-button" onClick={openFilterModal} type="button">
              <SlidersHorizontal size={16} />
              Filter & Sort
              {activeFilterChips.length ? <span className="button-count">{activeFilterChips.length}</span> : null}
            </button>
            <span className="data-chip">
              {selectedRequests.length} {activeBucket === "active" ? "active" : "completed"}
            </span>
            {hasActiveFilters ? (
              <button className="command-button ghost-action" onClick={clearFilters} type="button">
                <X size={15} />
                Clear all
              </button>
            ) : null}
          </div>
          {activeFilterChips.length ? (
            <div className="active-filter-chips" aria-label="Active filters">
              {activeFilterChips.map((chip) => (
                <span className="data-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div className="queue-list">
            {selectedRequests.map((request) => {
              const action = getRequestOperationAction(request.status);
              const statusTone = getOperationsStatusTone(request.status);
              return (
                <article className={`request-row operations-request-card status-tone-${statusTone}`} key={request.id}>
                  <span className={`pill priority-${getPriorityClassName(request.priority)} request-priority-corner`}>{getPriorityLabel(request.priority)}</span>
                  <div className="request-main operations-request-main">
                    <div className="request-message">
                      <MessageSquareText size={15} />
                      <strong>{latestPreview(request)}</strong>
                    </div>
                    <div className="request-meta-line">
                      <span>{request.servicePoint?.label || request.guestLocationLabel || "Service point"}</span>
                      <span>{formatRequestAge(request.createdAt)}</span>
                      <span>{request.title}</span>
                      {activeBucket === "completed" ? <span>{ratingLabel(request)}</span> : null}
                    </div>
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
      {isFilterModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeFilterModal}>
          <section
            aria-labelledby="operations-filter-title"
            aria-modal="true"
            className="operations-filter-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">Operations controls</div>
                <h2 id="operations-filter-title">Filter & Sort Requests</h2>
              </div>
              <button aria-label="Close filter modal" className="icon-button" onClick={closeFilterModal} type="button">
                <X size={16} />
              </button>
            </div>

            <div className="filter-table" role="table" aria-label="Operations filters">
              <div className="filter-table-header" role="row">
                <span role="columnheader">Filter</span>
                <span role="columnheader">Current Value</span>
                <span role="columnheader">Control</span>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Date Range</strong>
                <span>{dateRangeOptions.find((item) => item.value === draftFilters.dateRange)?.label}</span>
                <div className="filter-control-stack">
                  <select
                    className="command-select"
                    onChange={(event) => updateDraftFilters({ dateRange: event.target.value as OperationsDateRange })}
                    value={draftFilters.dateRange}
                  >
                    {dateRangeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {draftFilters.dateRange === "custom" ? (
                    <div className="date-range-inputs">
                      <input
                        aria-label="Custom start date"
                        onChange={(event) => updateDraftFilters({ customStart: event.target.value })}
                        type="date"
                        value={draftFilters.customStart}
                      />
                      <input
                        aria-label="Custom end date"
                        onChange={(event) => updateDraftFilters({ customEnd: event.target.value })}
                        type="date"
                        value={draftFilters.customEnd}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Rating</strong>
                <span>{draftFilters.rating === "all" ? "All ratings" : `${draftFilters.rating} stars`}</span>
                <select
                  className="command-select"
                  onChange={(event) => updateDraftFilters({ rating: event.target.value === "all" ? "all" : Number(event.target.value) })}
                  value={draftFilters.rating}
                >
                  <option value="all">All ratings</option>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating} {rating === 1 ? "star" : "stars"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Priority</strong>
                <span>{draftFilters.priorities.length ? `${draftFilters.priorities.length} selected` : "All priorities"}</span>
                <div className="filter-check-grid">
                  {priorityOptions.map((priority) => (
                    <label key={priority}>
                      <input
                        checked={draftFilters.priorities.includes(priority)}
                        onChange={() => updateDraftFilters({ priorities: toggleValue(draftFilters.priorities, priority) })}
                        type="checkbox"
                      />
                      {getOperationsPriorityLabel(priority)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Request Category</strong>
                <span>{draftFilters.categories.length ? `${draftFilters.categories.length} selected` : "All request types"}</span>
                <div className="filter-check-grid scroll-list">
                  {filterOptions.categories.map((category) => (
                    <label key={category}>
                      <input
                        checked={draftFilters.categories.includes(category)}
                        onChange={() => updateDraftFilters({ categories: toggleValue(draftFilters.categories, category) })}
                        type="checkbox"
                      />
                      {titleCase(category)}
                    </label>
                  ))}
                  {!filterOptions.categories.length ? <span className="meta">No categories available.</span> : null}
                </div>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Table Number</strong>
                <span>{draftFilters.tableQuery.trim() || "All tables"}</span>
                <div className="filter-control-stack">
                  <input
                    className="command-input"
                    list="operations-table-options"
                    onChange={(event) => updateDraftFilters({ tableQuery: event.target.value })}
                    placeholder="Search table or service point"
                    value={draftFilters.tableQuery}
                  />
                  <datalist id="operations-table-options">
                    {filterOptions.tables.map((table) => (
                      <option key={table} value={table} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Sort By</strong>
                <span>{sortOptions.find((item) => item.value === draftFilters.sortBy)?.label}</span>
                <select
                  className="command-select"
                  onChange={(event) => updateDraftFilters({ sortBy: event.target.value as OperationsSortBy })}
                  value={draftFilters.sortBy}
                >
                  {sortOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-table-row" role="row">
                <strong>Sort Direction</strong>
                <span>{sortDirectionOptions.find((item) => item.value === draftFilters.sortDirection)?.label}</span>
                <select
                  className="command-select"
                  onChange={(event) => updateDraftFilters({ sortDirection: event.target.value as OperationsSortDirection })}
                  value={draftFilters.sortDirection}
                >
                  {sortDirectionOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="command-button ghost-action" onClick={clearFilters} type="button">
                Clear all
              </button>
              <button className="command-button" onClick={closeFilterModal} type="button">
                Cancel
              </button>
              <button className="command-button primary" onClick={applyFilters} type="button">
                Apply filters
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
