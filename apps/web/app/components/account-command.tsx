"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Building2, CalendarClock, Clock3, Eye, EyeOff, LogOut, RefreshCw, Save, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { validatePasswordChange } from "@/lib/account-security";
import { apiRequest } from "@/lib/api/client";
import { getPrimaryMembership, hasCommandDashboardAccess } from "@/lib/auth/role-policy";
import type { CommandUser, CommandVenue, CommandVenueHours } from "@/lib/auth/types";
import {
  getRequestNotificationPermission,
  isRequestNotificationSupported,
  requestRequestNotificationPermission
} from "@/lib/request-notification-alerts";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";
import {
  adminVenueOpeningHoursPath,
  adminVenuesPath,
  createOpeningHoursPayload,
  getVenueChatAvailabilityPreview,
  normalizeOpeningHours,
  type OpeningHourDraft,
  weekdayLabels
} from "@/lib/venue-controls";

type SettingsSection = "organization" | "venue-hours" | "notifications" | "security";

const settingsSections: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "venue-hours", label: "Venue Hours", icon: CalendarClock },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck }
];

export function AccountCommand({ currentUser, initialSection }: { currentUser: CommandUser; initialSection?: string }) {
  const authClient = useMemo(() => createBrowserAuthClient(), []);
  const primaryMembership = getPrimaryMembership(currentUser);
  const canManageVenueSettings = hasCommandDashboardAccess(currentUser);
  const [activeSection, setActiveSection] = useState<SettingsSection>((initialSection as SettingsSection) || "organization");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleFields, setVisibleFields] = useState({ old: false, next: false, confirm: false });
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [hourDrafts, setHourDrafts] = useState<Record<string, OpeningHourDraft[]>>({});
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [updatingHoursId, setUpdatingHoursId] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [lastHoursSavedAt, setLastHoursSavedAt] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (initialSection && (["organization", "venue-hours", "notifications", "security"] as SettingsSection[]).includes(initialSection as SettingsSection)) {
      setActiveSection(initialSection as SettingsSection);
    }
  }, [initialSection]);

  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? venues[0] ?? null;
  const selectedHours = selectedVenue ? hourDrafts[selectedVenue.id] ?? normalizeOpeningHours(selectedVenue.hours) : [];
  const availabilityPreview = selectedVenue
    ? getVenueChatAvailabilityPreview(selectedHours, selectedVenue.timezone)
    : { isOpen: false, label: "No venue selected" };

  const loadVenues = useCallback(async () => {
    if (!canManageVenueSettings) {
      return;
    }

    if (!authClient) {
      setSettingsError("app auth is not configured.");
      return;
    }

    setVenuesLoading(true);
    setSettingsError(null);

    try {
      const nextVenues = await apiRequest<CommandVenue[]>(authClient, adminVenuesPath());
      setVenues(nextVenues);
      setSelectedVenueId((current) => current || nextVenues[0]?.id || "");
      setHourDrafts((current) => {
        const next = { ...current };
        for (const venue of nextVenues) {
          next[venue.id] = next[venue.id] ?? normalizeOpeningHours(venue.hours);
        }
        return next;
      });
    } catch (nextError) {
      setSettingsError(nextError instanceof Error ? nextError.message : "Could not load venue settings");
    } finally {
      setVenuesLoading(false);
    }
  }, [canManageVenueSettings, setSelectedVenueId, authClient]);

  useEffect(() => {
    const permission = getRequestNotificationPermission();
    if (permission !== "unsupported") {
      setNotificationPermission(permission);
    }
  }, []);

  useEffect(() => {
    void loadVenues();
  }, [loadVenues]);

  function updateHourDraft(venue: CommandVenue, dayOfWeek: number, patch: Partial<CommandVenueHours>) {
    setHourDrafts((current) => {
      const draft = current[venue.id] ?? normalizeOpeningHours(venue.hours);
      return {
        ...current,
        [venue.id]: draft.map((hours) => (hours.dayOfWeek === dayOfWeek ? { ...hours, ...patch } : hours))
      };
    });
  }

  async function saveOpeningHours(venue: CommandVenue) {
    if (!authClient) {
      setSettingsError("app auth is not configured.");
      return;
    }

    setUpdatingHoursId(venue.id);
    setSettingsError(null);

    try {
      const openingHours = hourDrafts[venue.id] ?? normalizeOpeningHours(venue.hours);
      const updated = await apiRequest<CommandVenue>(authClient, adminVenueOpeningHoursPath(venue.id), {
        method: "PATCH",
        body: JSON.stringify(createOpeningHoursPayload(openingHours))
      });
      setVenues((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setHourDrafts((current) => ({ ...current, [venue.id]: normalizeOpeningHours(updated.hours) }));
      setLastHoursSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (nextError) {
      setSettingsError(nextError instanceof Error ? nextError.message : "Could not update venue hours");
    } finally {
      setUpdatingHoursId(null);
    }
  }

  async function enableNotifications() {
    if (!isRequestNotificationSupported()) {
      setSettingsError("Browser notifications are not supported here.");
      return;
    }

    const permission = await requestRequestNotificationPermission();
    if (permission !== "unsupported") {
      setNotificationPermission(permission);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authClient) {
      setMessage("app auth is not configured.");
      return;
    }

    const validationError = validatePasswordChange({ oldPassword, newPassword, confirmPassword });
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await authClient.auth.updatePassword({ oldPassword, password: newPassword });
      setMessage(result.error ? result.error.message : "Password updated.");
      if (!result.error) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await authClient?.auth.signOut();
    window.location.reload();
  }

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Control plane</div>
          <h1>Settings</h1>
        </div>
      </div>

      {settingsError ? <div className="form-error wide">{settingsError}</div> : null}

      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings sections">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={activeSection === section.id ? "active" : ""}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                <Icon size={16} />
                {section.label}
              </button>
            );
          })}
        </aside>

        <div className="settings-stack">
          {activeSection === "organization" ? (
            <section className="command-panel settings-panel">
              <div className="panel-title-row">
                <div>
                  <h2>Organization Settings</h2>
                  <p className="meta">Organization-level configuration, policy, and operational defaults.</p>
                </div>
                <Building2 size={22} />
              </div>
              <div className="settings-facts">
                <div>
                  <span>Organization</span>
                  <strong>{primaryMembership?.organization.name || "Organization"}</strong>
                </div>
                <div>
                  <span>Organization slug</span>
                  <strong>{primaryMembership?.organization.slug || "Not configured"}</strong>
                </div>
                <div>
                  <span>Access scope</span>
                  <strong>{primaryMembership?.venue?.name || "Organization-wide access"}</strong>
                </div>
                <div>
                  <span>Memberships</span>
                  <strong>{currentUser.memberships.length}</strong>
                </div>
                <div>
                  <span>Default timezone</span>
                  <strong>{selectedVenue?.timezone || "Venue timezone"}</strong>
                </div>
                <div>
                  <span>Request categories</span>
                  <strong>QR quick actions + AI triage</strong>
                </div>
                <div>
                  <span>Visible priorities</span>
                  <strong>Normal, High, Urgent</strong>
                </div>
                <div>
                  <span>Data policy</span>
                  <strong>Organization scoped</strong>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "venue-hours" ? (
            <section className="command-panel settings-panel venue-hours-settings">
              <div className="panel-title-row">
                <div>
                  <h2>Venue Hours</h2>
                  <p className="meta">Opening hours control guest QR chat availability.</p>
                </div>
                <CalendarClock size={22} />
              </div>

              {!canManageVenueSettings ? (
                <div className="empty-state">Venue hours are managed by owners, admins, and managers.</div>
              ) : null}

              {canManageVenueSettings ? (
                <>
                  <div className="venue-hours-toolbar">
                    <label className="field-group">
                      <span>Venue</span>
                      <select className="command-select" onChange={(event) => setSelectedVenueId(event.target.value)} value={selectedVenueId}>
                        {venues.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="command-button" disabled={venuesLoading} onClick={() => void loadVenues()} type="button">
                      <RefreshCw size={16} />
                      Refresh
                    </button>
                  </div>

                  {selectedVenue ? (
                    <>
                      <div className={availabilityPreview.isOpen ? "hours-status open" : "hours-status closed"}>
                        <Clock3 size={17} />
                        <div>
                          <strong>{availabilityPreview.label}</strong>
                          <span>{selectedVenue.timezone}</span>
                        </div>
                      </div>

                      <div className="form-note warning-note">Changes affect guest QR chat availability immediately after saving.</div>

                      <div className="settings-schedule-actions">
                        <button
                          className="command-button primary"
                          disabled={updatingHoursId === selectedVenue.id}
                          onClick={() => void saveOpeningHours(selectedVenue)}
                          type="button"
                        >
                          <Save size={16} />
                          {updatingHoursId === selectedVenue.id ? "Saving..." : "Save venue hours"}
                        </button>
                        {lastHoursSavedAt ? <span className="data-chip">Saved {lastHoursSavedAt}</span> : null}
                      </div>

                      <div className="opening-hours-grid settings-hours-grid">
                        {selectedHours.map((hours) => (
                          <div className="opening-hours-row settings-hours-row" key={hours.dayOfWeek}>
                            <strong>{weekdayLabels[hours.dayOfWeek]}</strong>
                            <label>
                              <span>Open</span>
                              <input
                                disabled={hours.isClosed}
                                onChange={(event) => updateHourDraft(selectedVenue, hours.dayOfWeek, { opensAt: event.target.value })}
                                type="time"
                                value={hours.opensAt}
                              />
                            </label>
                            <label>
                              <span>Close</span>
                              <input
                                disabled={hours.isClosed}
                                onChange={(event) => updateHourDraft(selectedVenue, hours.dayOfWeek, { closesAt: event.target.value })}
                                type="time"
                                value={hours.closesAt}
                              />
                            </label>
                            <label className="closed-toggle">
                              <input
                                checked={hours.isClosed}
                                onChange={(event) => updateHourDraft(selectedVenue, hours.dayOfWeek, { isClosed: event.target.checked })}
                                type="checkbox"
                              />
                              Closed
                            </label>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">No venues available for this organization.</div>
                  )}
                </>
              ) : null}
            </section>
          ) : null}

          {activeSection === "notifications" ? (
            <section className="command-panel settings-panel">
              <div className="panel-title-row">
                <div>
                  <h2>Notifications</h2>
                  <p className="meta">Browser alerts for urgent operational changes.</p>
                </div>
                <Bell size={22} />
              </div>
              <div className="settings-facts">
                <div>
                  <span>Browser permission</span>
                  <strong>{notificationPermission}</strong>
                </div>
                <div>
                  <span>New requests</span>
                  <strong>Enabled in Operations</strong>
                </div>
                <div>
                  <span>Urgent requests</span>
                  <strong>High priority alerting</strong>
                </div>
              </div>
              <button className="command-button primary" disabled={notificationPermission === "granted"} onClick={() => void enableNotifications()} type="button">
                <Bell size={16} />
                {notificationPermission === "granted" ? "Notifications enabled" : "Enable notifications"}
              </button>
            </section>
          ) : null}

          {activeSection === "security" ? (
            <>
              <section className="command-panel settings-panel">
                <h2>Change password</h2>
                <form className="command-form" onSubmit={changePassword}>
                  <label className="password-field">
                    <span>Old password</span>
                    <div className="input-shell">
                      <input
                        autoComplete="current-password"
                        onChange={(event) => setOldPassword(event.target.value)}
                        required
                        type={visibleFields.old ? "text" : "password"}
                        value={oldPassword}
                      />
                      <button
                        aria-label={visibleFields.old ? "Hide old password" : "Show old password"}
                        className="password-toggle"
                        onClick={() => setVisibleFields((current) => ({ ...current, old: !current.old }))}
                        type="button"
                      >
                        {visibleFields.old ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                  <label className="password-field">
                    <span>New password</span>
                    <div className="input-shell">
                      <input
                        autoComplete="new-password"
                        minLength={10}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                        type={visibleFields.next ? "text" : "password"}
                        value={newPassword}
                      />
                      <button
                        aria-label={visibleFields.next ? "Hide new password" : "Show new password"}
                        className="password-toggle"
                        onClick={() => setVisibleFields((current) => ({ ...current, next: !current.next }))}
                        type="button"
                      >
                        {visibleFields.next ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                  <label className="password-field">
                    <span>Confirm new password</span>
                    <div className="input-shell">
                      <input
                        autoComplete="new-password"
                        minLength={10}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                        type={visibleFields.confirm ? "text" : "password"}
                        value={confirmPassword}
                      />
                      <button
                        aria-label={visibleFields.confirm ? "Hide confirmed password" : "Show confirmed password"}
                        className="password-toggle"
                        onClick={() => setVisibleFields((current) => ({ ...current, confirm: !current.confirm }))}
                        type="button"
                      >
                        {visibleFields.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                  {message ? <div className="form-note">{message}</div> : null}
                  <button className="command-button primary" disabled={loading} type="submit">
                    <ShieldCheck size={16} />
                    {loading ? "Updating..." : "Update password"}
                  </button>
                </form>
              </section>

              <section className="command-panel settings-panel">
                <h2>Session</h2>
                <button className="command-button danger" onClick={signOut} type="button">
                  <LogOut size={16} />
                  Sign out
                </button>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
