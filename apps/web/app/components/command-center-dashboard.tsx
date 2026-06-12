"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock3, Flame, Gauge, KeyRound, MapPin, PieChart, QrCode, RefreshCw, Rocket, ShieldAlert, Star, Users } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandSupportRequest, CommandUser, CommandVenue, LaunchStatus } from "@/lib/auth/types";
import { type DashboardVolumeWindow, calculateAdminDashboardControls, calculateDashboardAnalytics, getRequestVolumeSeries } from "@/lib/dashboard-analytics";
import { getDashboardExperience } from "@/lib/dashboard-experience";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";

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

function riskLabel(risk: "breached" | "soon", minutesUntilBreach: number) {
  return risk === "breached" ? "Breached" : `${minutesUntilBreach}m left`;
}

export function CommandCenterDashboard({ currentUser }: { currentUser: CommandUser }) {
  const authClient = useMemo(() => createBrowserAuthClient(), []);
  const experience = useMemo(() => getDashboardExperience(currentUser), [currentUser]);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [requests, setRequests] = useState<CommandSupportRequest[]>([]);
  const [launch, setLaunch] = useState<LaunchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [volumeWindow, setVolumeWindow] = useState<DashboardVolumeWindow>("hourly");

  const refresh = useCallback(async () => {
    if (!authClient) {
      setError("app auth is not configured.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const nextVenues = await apiRequest<CommandVenue[]>(authClient, "/admin/venues");
      const visibleVenues = experience.scopeVenueIds ? nextVenues.filter((venue) => experience.scopeVenueIds?.includes(venue.id)) : nextVenues;
      const requestGroups = await Promise.all(
        visibleVenues.map((venue) => apiRequest<CommandSupportRequest[]>(authClient, `/venues/${venue.id}/requests`).catch(() => []))
      );
      const nextLaunch = experience.showLaunchChecklist ? await apiRequest<LaunchStatus>(authClient, "/launch/status").catch(() => null) : null;
      const scopedRequests = experience.scopeVenueIds ? requestGroups.flat().filter((request) => experience.scopeVenueIds?.includes(request.venueId)) : requestGroups.flat();
      setVenues(visibleVenues);
      setRequests(scopedRequests);
      setLaunch(nextLaunch);
      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load dashboard analytics");
    } finally {
      setLoading(false);
    }
  }, [experience.scopeVenueIds, experience.showLaunchChecklist, authClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const analytics = useMemo(() => calculateDashboardAnalytics(requests), [requests]);
  const adminControls = useMemo(() => calculateAdminDashboardControls(venues, requests), [requests, venues]);
  const volume = useMemo(() => getRequestVolumeSeries(requests, volumeWindow), [requests, volumeWindow]);
  const maxVolumeCount = Math.max(1, ...volume.series.map((item) => item.count));
  const maxRatingCount = Math.max(1, ...analytics.satisfactionRecovery.ratingDistribution.map((item) => item.count));
  const maxHotspotCount = Math.max(1, ...analytics.servicePointHotspots.map((item) => item.count));
  const maxStaffLoad = Math.max(1, ...analytics.staffWorkload.map((item) => item.openAssigned));
  const venueNameById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue.name])), [venues]);
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
  const volumeWindows: Array<{ label: string; value: DashboardVolumeWindow }> = [
    { label: "Hourly", value: "hourly" },
    { label: "Daily", value: "daily" },
    { label: "Weekly", value: "weekly" },
    { label: "Monthly", value: "monthly" }
  ];
  const kpis = [
    {
      detail: analytics.operationalHealth.drivers[0] || "No active risk drivers",
      icon: Gauge,
      label: `${experience.kpiLabels.health} · ${analytics.operationalHealth.label}`,
      tone: analytics.operationalHealth.score < 75 ? "warn" : "ok",
      value: `${analytics.operationalHealth.score}`
    },
    {
      detail: `${analytics.liveHealth.openRequests} open · ${analytics.liveHealth.urgentOrHighPriority} urgent/high`,
      icon: AlertTriangle,
      label: experience.kpiLabels.risk,
      tone: analytics.slaRiskForecast.length ? "warn" : "ok",
      value: analytics.slaRiskForecast.length.toString()
    },
    {
      detail: `${analytics.responseSpeed.overResponseThreshold} over threshold`,
      icon: Clock3,
      label: experience.kpiLabels.speed,
      tone: analytics.responseSpeed.overResponseThreshold ? "warn" : "idle",
      value: formatMinutes(analytics.responseSpeed.averageAcknowledgementMinutes)
    },
    {
      detail: `${analytics.satisfactionRecovery.lowRatingCount} low-rating recoveries`,
      icon: Star,
      label: experience.kpiLabels.satisfaction,
      tone: analytics.satisfactionRecovery.lowRatingCount ? "warn" : "ok",
      value: analytics.satisfactionRecovery.averageRating === null ? "No rating" : `${analytics.satisfactionRecovery.averageRating.toFixed(1)}/5`
    }
  ];

  return (
    <section className="command-grid dashboard-analytics">
      <div className="command-heading">
        <div>
          <div className="eyebrow">{experience.eyebrow}</div>
          <h1>{experience.title}</h1>
          <span className="panel-subtle">{experience.scopeLabel}</span>
        </div>
        <div className="command-actions">
          <span className="data-chip">{lastUpdatedAt ? `Updated ${lastUpdatedAt}` : loading ? "Syncing" : "Live"}</span>
          <button className="command-button" disabled={loading} onClick={() => void refresh()} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="form-error wide">{error}</div> : null}

      {launch && experience.showLaunchChecklist && !launch.isComplete ? <LaunchChecklist status={launch} /> : null}

      {experience.panels.adminControls ? <AdminControls controls={adminControls} /> : null}

      <div className="metric-strip dashboard-summary-grid">
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

      <section className="command-panel action-panel wide">
        <div className="panel-title-row">
          <div>
            <h2>{experience.actionHeading}</h2>
            <span className="panel-subtle">
              {analytics.anomalies.length ? `${analytics.anomalies.length} operational signal${analytics.anomalies.length === 1 ? "" : "s"} need review` : "No urgent admin actions"}
            </span>
          </div>
          <a className="command-button" href="?view=operations">
            <Activity size={16} />
            Open operations
          </a>
        </div>
        <div className="action-grid">
          {analytics.anomalies.map((item) => (
            <article className={`action-card severity-${item.severity}`} key={`${item.label}-${item.detail}`}>
              <span>{item.severity}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
          {!analytics.anomalies.length ? <div className="empty-state">{experience.actionEmptyCopy}</div> : null}
        </div>
      </section>

      <section className="command-panel chart-panel chart-panel-large">
        <div className="panel-title-row">
          <div>
            <h2>{experience.volumeTitle}</h2>
            <span className="panel-subtle">
              {volume.busiest ? `${volume.label}: ${volume.busiest.label} (${volume.busiest.count})` : "No request volume yet"}
            </span>
          </div>
          <div className="dashboard-range-controls" aria-label="Request volume range">
            {volumeWindows.map((item) => (
              <button
                aria-pressed={volumeWindow === item.value}
                className={volumeWindow === item.value ? "active" : ""}
                key={item.value}
                onClick={() => setVolumeWindow(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="vertical-chart" aria-label={`Requests by ${volumeWindow}`}>
          {volume.series.map((item) => (
            <div className="vertical-chart-column" key={item.label}>
              <span>{item.count}</span>
              <div style={{ height: chartPercent(item.count, maxVolumeCount) }} />
              <small>{item.label}</small>
            </div>
          ))}
          {!volume.series.length ? <div className="empty-state">No request volume yet.</div> : null}
        </div>
      </section>

      <section className="command-panel chart-panel">
        <div className="panel-title-row">
          <div>
            <h2>Response Risk</h2>
            <span className="panel-subtle">Requests most likely to breach next</span>
          </div>
          <ShieldAlert size={17} />
        </div>
        <div className="risk-list">
          {analytics.slaRiskForecast.map((request) => (
            <div className={`risk-row risk-${request.risk}`} key={request.id}>
              <span>{riskLabel(request.risk, request.minutesUntilBreach)}</span>
              <strong>{request.title}</strong>
              <small>{request.priority.toLowerCase()} · waiting {formatMinutes(request.waitMinutes)}</small>
            </div>
          ))}
          {!analytics.slaRiskForecast.length ? <div className="empty-state">No requests are approaching SLA breach.</div> : null}
        </div>
      </section>

      <section className="command-panel chart-panel">
        <div className="panel-title-row">
          <h2>Category Trend Mix</h2>
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

      {experience.panels.servicePointHotspots ? (
        <section className="command-panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>Active Tables</h2>
              <span className="panel-subtle">Where repeated demand is clustering</span>
            </div>
            <MapPin size={17} />
          </div>
          <div className="horizontal-chart">
            {analytics.servicePointHotspots.map((item) => (
              <div className="horizontal-chart-row hotspot-row" key={item.servicePointId}>
                <span>{item.label}</span>
                <div>
                  <i style={{ width: chartPercent(item.count, maxHotspotCount) }} />
                </div>
                <strong>{item.count}</strong>
                <small>{item.zone || "No zone"} · {item.urgentOrHigh} urgent/high</small>
              </div>
            ))}
            {!analytics.servicePointHotspots.length ? <div className="empty-state">No service-point hotspots yet.</div> : null}
          </div>
        </section>
      ) : null}

      <section className="command-panel chart-panel chart-panel-large">
        <div className="panel-title-row">
          <h2>Guest Satisfaction</h2>
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

      {experience.panels.staffWorkload ? (
        <section className="command-panel chart-panel chart-panel-large">
          <div className="panel-title-row">
            <div>
              <h2>Team Workload</h2>
              <span className="panel-subtle">Open load, high-priority pressure, completion pace, and recovery signals</span>
            </div>
            <Users size={17} />
          </div>
          <div className="workload-grid">
            {analytics.staffWorkload.map((staff) => (
              <article className="workload-card" key={staff.staffId}>
                <div>
                  <strong>{staff.label}</strong>
                  <span>{staff.openAssigned} open · {staff.urgentOrHigh} urgent/high</span>
                </div>
                <i style={{ width: chartPercent(staff.openAssigned, maxStaffLoad) }} />
                <small>{staff.completed} completed · avg {formatMinutes(staff.averageCompletionMinutes)} · {staff.lowRatings} low ratings</small>
              </article>
            ))}
            {!analytics.staffWorkload.length ? <div className="empty-state">No assigned staff workload yet.</div> : null}
          </div>
        </section>
      ) : null}

      {experience.panels.venuePerformance ? (
        <section className="command-panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>Venue Performance</h2>
              <span className="panel-subtle">Compare operational pressure across venues</span>
            </div>
            <Flame size={17} />
          </div>
          <div className="venue-performance-list">
            {analytics.venuePerformance.map((venue) => (
              <div key={venue.venueId}>
                <strong>{venueNameById.get(venue.venueId) || venue.venueId}</strong>
                <span>{venue.openRequests} open · {venue.urgentOrHigh} urgent/high</span>
                <small>Avg complete {formatMinutes(venue.averageCompletionMinutes)} · rating {venue.averageRating === null ? "No rating" : venue.averageRating.toFixed(1)}</small>
              </div>
            ))}
            {!analytics.venuePerformance.length ? <div className="empty-state">No venue comparison data yet.</div> : null}
          </div>
        </section>
      ) : null}

    </section>
  );
}

function AdminControls({ controls }: { controls: ReturnType<typeof calculateAdminDashboardControls> }) {
  const topSetupGap = controls.venueSetupGaps[0];
  const setupGapDetail = topSetupGap
    ? `${topSetupGap.venueName}: ${topSetupGap.gaps.join(", ")}`
    : "All venues have opening hours and active QR points.";
  const controlsList = [
    {
      detail: `${controls.urgentUnassignedRequests} urgent/high need owner assignment`,
      href: "?view=operations",
      icon: ShieldAlert,
      label: "Request ownership",
      tone: controls.urgentUnassignedRequests ? "high" : controls.openUnassignedRequests ? "medium" : "low",
      value: `${controls.openUnassignedRequests} unassigned`
    },
    {
      detail: controls.escalatedRequests ? "Escalations need admin or manager review." : "No escalated requests waiting.",
      href: "?view=operations",
      icon: AlertTriangle,
      label: "Escalation queue",
      tone: controls.escalatedRequests ? "high" : "low",
      value: `${controls.escalatedRequests} escalated`
    },
    {
      detail: `${controls.inactiveServicePoints} inactive QR point${controls.inactiveServicePoints === 1 ? "" : "s"} across managed venues`,
      href: "?view=venues",
      icon: QrCode,
      label: "QR coverage",
      tone: controls.activeServicePoints ? (controls.inactiveServicePoints ? "medium" : "low") : "high",
      value: `${controls.activeServicePoints} active`
    },
    {
      detail: setupGapDetail,
      href: "?view=venues",
      icon: KeyRound,
      label: "Venue readiness",
      tone: controls.venueSetupGaps.length ? "medium" : "low",
      value: `${controls.venueSetupGaps.length} gaps`
    }
  ];

  return (
    <section className="command-panel admin-controls-panel wide" aria-label="Admin dashboard controls">
      <div className="panel-title-row">
        <div>
          <h2>Management</h2>
          <span className="panel-subtle">Operational access, queue ownership, and venue readiness controls</span>
        </div>
        <span className="data-chip">{controls.activeServicePoints} live QR points</span>
      </div>
      <div className="admin-control-grid">
        {controlsList.map((item) => {
          const Icon = item.icon;
          return (
            <a className={`admin-control-card tone-${item.tone}`} href={item.href} key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
              <ArrowRight size={14} />
            </a>
          );
        })}
      </div>
    </section>
  );
}

const stepSectionMap: Record<string, string | undefined> = {
  organization: "organization",
  opening_hours: "venue-hours"
};

function LaunchChecklist({ status }: { status: LaunchStatus }) {
  const percent = Math.round((status.completedCount / status.totalCount) * 100);

  return (
    <section className="command-panel launch-checklist wide" aria-label="Organization launch checklist">
      <div className="launch-checklist-header">
        <div>
          <div className="eyebrow">Launch checklist</div>
          <h2>Get your organization ready for live guests</h2>
          <span className="panel-subtle">
            {status.completedCount} of {status.totalCount} setup steps complete
          </span>
        </div>
        <div className="launch-progress" aria-label={`${percent}% complete`}>
          <Rocket size={18} />
          <strong>{percent}%</strong>
        </div>
      </div>
      <div className="launch-progress-track">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="launch-step-grid">
        {status.steps.map((step) => {
          const Icon = step.complete ? CheckCircle2 : Circle;
          const section = stepSectionMap[step.id];
          const href = section ? `?view=${step.actionView}&section=${section}` : `?view=${step.actionView}`;
          return (
            <article className={step.complete ? "launch-step complete" : "launch-step"} key={step.id}>
              <Icon size={18} />
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              <a className="command-button" href={href}>
                {step.actionLabel}
                <ArrowRight size={14} />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
