"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Clock3, PieChart, RefreshCw, Star } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandSupportRequest, CommandVenue } from "@/lib/auth/types";
import { calculateDashboardAnalytics } from "@/lib/dashboard-analytics";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function formatMinutes(value: number | null) {
  if (value === null) {
    return "No data";
  }

  if (value < 60) {
    return `${value}m`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function chartPercent(count: number, max: number) {
  if (count <= 0 || max <= 0) {
    return "0%";
  }

  return `${Math.max(7, Math.round((count / max) * 100))}%`;
}

export function CommandCenterDashboard() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const nextVenues = await apiRequest<CommandVenue[]>(supabase, "/admin/venues");
      const requestGroups = await Promise.all(
        nextVenues.map((venue) => apiRequest<CommandSupportRequest[]>(supabase, `/venues/${venue.id}/requests`).catch(() => []))
      );
      setVenues(nextVenues);
      setRequests(requestGroups.flat());
      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load dashboard analytics");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const analytics = useMemo(() => calculateDashboardAnalytics(requests), [requests]);
  const maxHourlyCount = Math.max(1, ...analytics.requestVolumeByHour.map((item) => item.count));
  const maxCategoryCount = Math.max(1, ...analytics.categoryBreakdown.map((item) => item.count));
  const maxRatingCount = Math.max(1, ...analytics.satisfactionRecovery.ratingDistribution.map((item) => item.count));
  const busiestHour = analytics.requestVolumeByHour.reduce<{ count: number; hour: string } | null>(
    (best, item) => (!best || item.count > best.count ? item : best),
    null
  );
  const categoryGradient = analytics.categoryBreakdown.length
    ? analytics.categoryBreakdown.reduce(
        (segments, item, index) => {
          const start = segments.offset;
          const end = start + (item.count / requests.length) * 100;
          return {
            offset: end,
            value: `${segments.value}${index ? ", " : ""}var(--chart-${(index % 5) + 1}) ${start}% ${end}%`
          };
        },
        { offset: 0, value: "" }
      ).value
    : "rgba(255,255,255,0.08) 0% 100%";
  const summary = requests.length
    ? `${plural(requests.length, "request")} across ${plural(venues.length, "venue")} · busiest hour ${
        busiestHour ? `${busiestHour.hour} (${busiestHour.count})` : "none"
      } · ${plural(analytics.liveHealth.slaBreaches, "SLA breach", "SLA breaches")}`
    : "No request data yet. Activity will appear here as guests use QR support.";
  const kpis = [
    {
      detail: `${analytics.liveHealth.urgentOrHighPriority} urgent/high`,
      icon: AlertTriangle,
      label: "Open requests",
      tone: analytics.liveHealth.urgentOrHighPriority ? "warn" : "ok",
      value: analytics.liveHealth.openRequests.toString()
    },
    {
      detail: "longest active wait",
      icon: Clock3,
      label: "Longest wait",
      tone: analytics.liveHealth.longestWaitingMinutes >= 10 ? "warn" : "idle",
      value: formatMinutes(analytics.liveHealth.longestWaitingMinutes)
    },
    {
      detail: `${analytics.responseSpeed.overResponseThreshold} slow acknowledgements`,
      icon: BarChart3,
      label: "Avg acknowledgement",
      tone: analytics.responseSpeed.overResponseThreshold ? "warn" : "ok",
      value: formatMinutes(analytics.responseSpeed.averageAcknowledgementMinutes)
    },
    {
      detail: `${analytics.satisfactionRecovery.ratedCount} rated`,
      icon: Star,
      label: "Guest rating",
      tone: analytics.satisfactionRecovery.lowRatingCount ? "warn" : "idle",
      value: analytics.satisfactionRecovery.averageRating === null ? "No data" : analytics.satisfactionRecovery.averageRating.toFixed(1)
    }
  ];

  return (
    <section className="command-grid dashboard-analytics">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Owner analytics</div>
          <h1>Dashboard</h1>
        </div>
        <button className="command-button" disabled={loading} onClick={() => void refresh()} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error ? <div className="form-error wide">{error}</div> : null}

      <section className="command-panel wide dashboard-summary-card">
        <div>
          <span className="data-chip">{lastUpdatedAt ? `Updated ${lastUpdatedAt}` : loading ? "Syncing" : "Live"}</span>
          <h2>{summary}</h2>
        </div>
      </section>

      <div className="metric-strip">
        {kpis.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={`command-metric dashboard-kpi tone-${metric.tone}`} key={metric.label}>
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

      <section className="command-panel chart-panel chart-panel-large">
        <div className="panel-title-row">
          <h2>Request Volume</h2>
          <span className="data-chip">By hour</span>
        </div>
        <div className="vertical-chart" aria-label="Requests by hour">
          {analytics.requestVolumeByHour.map((item) => (
            <div className="vertical-chart-column" key={item.hour}>
              <span>{item.count}</span>
              <div style={{ height: chartPercent(item.count, maxHourlyCount) }} />
              <small>{item.hour}</small>
            </div>
          ))}
          {!analytics.requestVolumeByHour.length ? <div className="empty-state">No request volume yet.</div> : null}
        </div>
      </section>

      <section className="command-panel chart-panel">
        <div className="panel-title-row">
          <h2>Issue Mix</h2>
          <PieChart size={17} />
        </div>
        <div className="donut-row">
          <div aria-label="Issue category breakdown" className="donut-chart" style={{ background: `conic-gradient(${categoryGradient})` }}>
            <span>{requests.length}</span>
            <small>total</small>
          </div>
          <div className="chart-legend">
            {analytics.categoryBreakdown.slice(0, 6).map((item, index) => (
              <div key={item.category}>
                <i style={{ background: `var(--chart-${(index % 5) + 1})` }} />
                <span>{titleCase(item.category)}</span>
                <strong>{item.percent}%</strong>
              </div>
            ))}
            {!analytics.categoryBreakdown.length ? <div className="empty-state">No categories yet.</div> : null}
          </div>
        </div>
      </section>

      <section className="command-panel chart-panel">
        <div className="panel-title-row">
          <h2>Top Categories</h2>
          <span className="data-chip">Ranked</span>
        </div>
        <div className="horizontal-chart">
          {analytics.categoryBreakdown.slice(0, 5).map((item) => (
            <div className="horizontal-chart-row" key={item.category}>
              <span>{titleCase(item.category)}</span>
              <div>
                <i style={{ width: chartPercent(item.count, maxCategoryCount) }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
          {!analytics.categoryBreakdown.length ? <div className="empty-state">No category data yet.</div> : null}
        </div>
      </section>

      <section className="command-panel chart-panel">
        <div className="panel-title-row">
          <h2>Response Speed</h2>
          <span className="data-chip">Team pace</span>
        </div>
        <div className="response-bars">
          <div>
            <span>Acknowledge</span>
            <strong>{formatMinutes(analytics.responseSpeed.averageAcknowledgementMinutes)}</strong>
            <i style={{ width: chartPercent(analytics.responseSpeed.averageAcknowledgementMinutes ?? 0, 30) }} />
          </div>
          <div>
            <span>Complete</span>
            <strong>{formatMinutes(analytics.responseSpeed.averageCompletionMinutes)}</strong>
            <i style={{ width: chartPercent(analytics.responseSpeed.averageCompletionMinutes ?? 0, 60) }} />
          </div>
          <div>
            <span>Over threshold</span>
            <strong>{analytics.responseSpeed.overResponseThreshold}</strong>
            <i style={{ width: chartPercent(analytics.responseSpeed.overResponseThreshold, Math.max(1, requests.length)) }} />
          </div>
        </div>
      </section>

      <section className="command-panel chart-panel chart-panel-large">
        <div className="panel-title-row">
          <h2>Guest Satisfaction & Recovery</h2>
          <span className="data-chip">{analytics.satisfactionRecovery.lowRatingCount} low ratings</span>
        </div>
        <div className="satisfaction-layout">
          <div className="rating-bars" aria-label="Rating distribution">
            {analytics.satisfactionRecovery.ratingDistribution.map((item) => (
              <div key={item.rating}>
                <span>{item.rating}</span>
                <i style={{ height: chartPercent(item.count, maxRatingCount) }} />
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
          <div className="recovery-table">
            {analytics.satisfactionRecovery.lowRatedRequests.map((request) => (
              <div key={request.id}>
                <span>{request.rating}/5</span>
                <strong>{request.title}</strong>
              </div>
            ))}
            {!analytics.satisfactionRecovery.lowRatedRequests.length ? (
              <div className="empty-state">No low-rating recoveries waiting.</div>
            ) : null}
          </div>
        </div>
      </section>
    </section>
  );
}
