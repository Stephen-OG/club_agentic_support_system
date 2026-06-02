"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, Clock3, Copy, Download, Edit3, MapPinned, Plus, QrCode, RefreshCw, Save, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandServicePoint, CommandVenue, CommandVenueLocation, CommandVenueOpeningHour } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { generateQrCodeDataUrl } from "@/lib/qr";
import {
  createLocationPayload,
  createOpeningHoursPayload,
  createServicePointPayload,
  createServicePointUpdatePayload,
  normalizeOpeningHours,
  servicePointGuestUrl,
  venueWideGuestUrl,
  weekdayLabels
} from "@/lib/venue-controls";

type QrPreview = {
  label: string;
  url: string;
  dataUrl: string;
};

type ServicePointDraft = {
  label: string;
  locationId: string;
};

type LocationDraft = {
  name: string;
};

export function VenuesCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrPreview, setQrPreview] = useState<QrPreview | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [hourDrafts, setHourDrafts] = useState<Record<string, CommandVenueOpeningHour[]>>({});
  const [updatingHoursId, setUpdatingHoursId] = useState<string | null>(null);
  const [servicePointDrafts, setServicePointDrafts] = useState<Record<string, ServicePointDraft>>({});
  const [editingPointDrafts, setEditingPointDrafts] = useState<Record<string, ServicePointDraft>>({});
  const [locationDrafts, setLocationDrafts] = useState<Record<string, LocationDraft>>({});
  const [creatingPointId, setCreatingPointId] = useState<string | null>(null);
  const [creatingLocationId, setCreatingLocationId] = useState<string | null>(null);
  const [savingPointId, setSavingPointId] = useState<string | null>(null);
  const [deletingPointId, setDeletingPointId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      setVenues(await apiRequest<CommandVenue[]>(supabase, "/admin/venues"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load venues");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const handleGenerateQr = useCallback(async (url: string, label: string) => {
    setQrLoading(true);
    try {
      const dataUrl = await generateQrCodeDataUrl(url);
      setQrPreview({ label, url, dataUrl });
    } finally {
      setQrLoading(false);
    }
  }, []);

  const handleDownloadQr = useCallback(async (url: string, label: string) => {
    const dataUrl = await generateQrCodeDataUrl(url);
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "qr"}.png`;
    anchor.click();
  }, []);

  function updateHourDraft(venue: CommandVenue, dayOfWeek: number, patch: Partial<CommandVenueOpeningHour>) {
    setHourDrafts((current) => {
      const draft = current[venue.id] ?? normalizeOpeningHours(venue.openingHours);
      return {
        ...current,
        [venue.id]: draft.map((hours) => (hours.dayOfWeek === dayOfWeek ? { ...hours, ...patch } : hours))
      };
    });
  }

  function updateServicePointDraft(venueId: string, patch: Partial<ServicePointDraft>) {
    setServicePointDrafts((current) => ({
      ...current,
      [venueId]: {
        ...(current[venueId] ?? { label: "", locationId: "" }),
        ...patch
      }
    }));
  }

  function updateEditingPointDraft(pointId: string, patch: Partial<ServicePointDraft>) {
    setEditingPointDrafts((current) => ({
      ...current,
      [pointId]: {
        ...(current[pointId] ?? { label: "", locationId: "" }),
        ...patch
      }
    }));
  }

  function updateLocationDraft(venueId: string, patch: Partial<LocationDraft>) {
    setLocationDrafts((current) => ({
      ...current,
      [venueId]: {
        ...(current[venueId] ?? { name: "" }),
        ...patch
      }
    }));
  }

  function locationForPoint(venue: CommandVenue, point: CommandServicePoint) {
    return point.location ?? venue.locations.find((location) => location.id === point.locationId) ?? null;
  }

  function locationLabel(location: CommandVenueLocation | null) {
    return location?.zone || location?.name || "No zone";
  }

  async function createServicePoint(event: FormEvent<HTMLFormElement>, venue: CommandVenue) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setCreatingPointId(venue.id);
    setError(null);

    try {
      const draft = servicePointDrafts[venue.id] ?? { label: "", locationId: "" };
      const point = await apiRequest<CommandServicePoint>(supabase, `/admin/venues/${venue.id}/service-points`, {
        method: "POST",
        body: JSON.stringify(createServicePointPayload(draft))
      });
      setVenues((current) =>
        current.map((item) =>
          item.id === venue.id
            ? {
                ...item,
                servicePoints: [...item.servicePoints, point].sort((left, right) => left.label.localeCompare(right.label))
              }
            : item
        )
      );
      setServicePointDrafts((current) => ({ ...current, [venue.id]: { label: "", locationId: "" } }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create QR point");
    } finally {
      setCreatingPointId(null);
    }
  }

  async function createVenueLocation(event: FormEvent<HTMLFormElement>, venue: CommandVenue) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setCreatingLocationId(venue.id);
    setError(null);

    try {
      const draft = locationDrafts[venue.id] ?? { name: "" };
      const location = await apiRequest<CommandVenueLocation>(supabase, `/admin/venues/${venue.id}/locations`, {
        method: "POST",
        body: JSON.stringify(createLocationPayload(draft))
      });
      setVenues((current) =>
        current.map((item) =>
          item.id === venue.id
            ? {
                ...item,
                locations: [...item.locations, location].sort((left, right) => left.name.localeCompare(right.name))
              }
            : item
        )
      );
      setLocationDrafts((current) => ({ ...current, [venue.id]: { name: "" } }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create zone");
    } finally {
      setCreatingLocationId(null);
    }
  }

  async function updateServicePoint(venue: CommandVenue, point: CommandServicePoint) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const draft = editingPointDrafts[point.id] ?? { label: point.label, locationId: point.locationId ?? "" };
    setSavingPointId(point.id);
    setError(null);

    try {
      const updated = await apiRequest<CommandServicePoint>(supabase, `/admin/venues/${venue.id}/service-points/${point.id}`, {
        method: "PATCH",
        body: JSON.stringify(createServicePointUpdatePayload(draft))
      });
      setVenues((current) =>
        current.map((item) =>
          item.id === venue.id
            ? {
                ...item,
                servicePoints: item.servicePoints
                  .map((servicePoint) => (servicePoint.id === updated.id ? updated : servicePoint))
                  .sort((left, right) => left.label.localeCompare(right.label))
              }
            : item
        )
      );
      setEditingPointDrafts((current) => {
        const next = { ...current };
        delete next[point.id];
        return next;
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update QR point");
    } finally {
      setSavingPointId(null);
    }
  }

  async function deleteServicePoint(venue: CommandVenue, point: CommandServicePoint) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setDeletingPointId(point.id);
    setError(null);

    try {
      await apiRequest<CommandServicePoint>(supabase, `/admin/venues/${venue.id}/service-points/${point.id}`, {
        method: "DELETE"
      });
      setVenues((current) =>
        current.map((item) =>
          item.id === venue.id
            ? {
                ...item,
                servicePoints: item.servicePoints.filter((servicePoint) => servicePoint.id !== point.id)
              }
            : item
        )
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete QR point");
    } finally {
      setDeletingPointId(null);
    }
  }

  function startEditingPoint(point: CommandServicePoint) {
    setEditingPointDrafts((current) => ({
      ...current,
      [point.id]: {
        label: point.label,
        locationId: point.locationId ?? ""
      }
    }));
  }

  function cancelEditingPoint(pointId: string) {
    setEditingPointDrafts((current) => {
      const next = { ...current };
      delete next[pointId];
      return next;
    });
  }

  async function saveOpeningHours(venue: CommandVenue) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setUpdatingHoursId(venue.id);
    setError(null);

    try {
      const openingHours = hourDrafts[venue.id] ?? normalizeOpeningHours(venue.openingHours);
      const updated = await apiRequest<CommandVenue>(supabase, `/admin/venues/${venue.id}/opening-hours`, {
        method: "PATCH",
        body: JSON.stringify(createOpeningHoursPayload(openingHours))
      });
      setVenues((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setHourDrafts((current) => ({ ...current, [venue.id]: normalizeOpeningHours(updated.openingHours) }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update opening hours");
    } finally {
      setUpdatingHoursId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Workspace topology</div>
          <h1>Venues & service points</h1>
        </div>
        <button className="command-button" disabled={loading} onClick={() => void refresh()} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error ? <div className="form-error wide">{error}</div> : null}

      <div className="venue-grid">
        {venues.map((venue) => (
          <article className="command-panel venue-card" key={venue.id}>
            {(() => {
              const guestAppUrl = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
              const venueUrl = venueWideGuestUrl(guestAppUrl, venue.slug);
              const servicePointDraft = servicePointDrafts[venue.id] ?? { label: "", locationId: "" };
              const locationDraft = locationDrafts[venue.id] ?? { name: "" };

              return (
                <>
            <div className="panel-title-row">
              <div>
                <h2>{venue.name}</h2>
                <p className="meta">{venue.timezone}</p>
              </div>
              <MapPinned size={22} />
            </div>
            <div className="venue-stats">
              <span>{venue.locations.length} zones</span>
              <span>{venue.servicePoints.length} QR points</span>
            </div>
            <div className="service-point-row venue-wide-row">
              <QrCode size={18} />
              <div>
                <strong>Venue-wide QR</strong>
                <span>{venueUrl}</span>
              </div>
              <div className="service-point-actions">
                <button
                  aria-label={`Generate venue-wide QR code for ${venue.name}`}
                  className="icon-button"
                  onClick={() => void handleGenerateQr(venueUrl, `${venue.name} venue support`)}
                  type="button"
                >
                  <QrCode size={15} />
                </button>
                <button
                  aria-label={`Copy venue-wide guest URL for ${venue.name}`}
                  className="icon-button"
                  onClick={() => void navigator.clipboard.writeText(venueUrl)}
                  type="button"
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
            <div className="opening-hours-editor">
              <div className="hours-editor-heading">
                <span>
                  <Clock3 size={15} />
                  Opening schedule
                </span>
                <button
                  className="icon-button"
                  disabled={updatingHoursId === venue.id}
                  onClick={() => void saveOpeningHours(venue)}
                  type="button"
                  aria-label={`Save opening hours for ${venue.name}`}
                >
                  <Save size={15} />
                </button>
              </div>
              <div className="opening-hours-grid">
                {(hourDrafts[venue.id] ?? normalizeOpeningHours(venue.openingHours)).map((hours) => (
                  <div className="opening-hours-row" key={hours.dayOfWeek}>
                    <strong>{weekdayLabels[hours.dayOfWeek]}</strong>
                    <label>
                      <span>Open</span>
                      <input
                        disabled={hours.isClosed}
                        onChange={(event) => updateHourDraft(venue, hours.dayOfWeek, { opensAt: event.target.value })}
                        type="time"
                        value={hours.opensAt}
                      />
                    </label>
                    <label>
                      <span>Close</span>
                      <input
                        disabled={hours.isClosed}
                        onChange={(event) => updateHourDraft(venue, hours.dayOfWeek, { closesAt: event.target.value })}
                        type="time"
                        value={hours.closesAt}
                      />
                    </label>
                    <label className="closed-toggle">
                      <input
                        checked={hours.isClosed}
                        onChange={(event) => updateHourDraft(venue, hours.dayOfWeek, { isClosed: event.target.checked })}
                        type="checkbox"
                      />
                      Closed
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <form className="zone-create-form" onSubmit={(event) => void createVenueLocation(event, venue)}>
              <label className="field-group zone-name-field">
                <span>New zone</span>
                <input
                  onChange={(event) => updateLocationDraft(venue.id, { name: event.target.value })}
                  placeholder="Balcony, main bar, terrace..."
                  required
                  value={locationDraft.name}
                />
              </label>
              <button className="command-button secondary-action" disabled={creatingLocationId === venue.id} type="submit">
                <Plus size={15} />
                {creatingLocationId === venue.id ? "Creating..." : "Add zone"}
              </button>
            </form>
            <form className="service-point-form" onSubmit={(event) => void createServicePoint(event, venue)}>
              <label className="field-group qr-point-name-field">
                <span>New QR point</span>
                <input
                  className="truncate-input"
                  onChange={(event) => updateServicePointDraft(venue.id, { label: event.target.value })}
                  placeholder="Table 12, bar, VIP booth..."
                  required
                  title={servicePointDraft.label}
                  value={servicePointDraft.label}
                />
              </label>
              <label className="field-group qr-point-zone-field">
                <span>Zone</span>
                <select
                  onChange={(event) => updateServicePointDraft(venue.id, { locationId: event.target.value })}
                  value={servicePointDraft.locationId}
                >
                  <option value="">No zone</option>
                  {venue.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="command-button primary" disabled={creatingPointId === venue.id} type="submit">
                <Plus size={15} />
                {creatingPointId === venue.id ? "Creating..." : "Add QR point"}
              </button>
            </form>
            <div className="service-point-list">
              {venue.servicePoints.map((point) => {
                const publicUrl = servicePointGuestUrl(guestAppUrl, point.qrToken);
                const editingDraft = editingPointDrafts[point.id];
                const pointLocation = locationForPoint(venue, point);
                const zoneLabel = locationLabel(pointLocation);
                return (
                  <div className={editingDraft ? "service-point-row editing" : "service-point-row"} key={point.id}>
                    {editingDraft ? (
                      <>
                        <QrCode size={18} />
                        <div className="service-point-edit-grid">
                          <label className="field-group qr-point-name-field">
                            <span>QR point</span>
                            <input
                              className="truncate-input"
                              onChange={(event) => updateEditingPointDraft(point.id, { label: event.target.value })}
                              required
                              title={editingDraft.label}
                              value={editingDraft.label}
                            />
                          </label>
                          <label className="field-group qr-point-zone-field">
                            <span>Zone</span>
                            <select
                              onChange={(event) => updateEditingPointDraft(point.id, { locationId: event.target.value })}
                              value={editingDraft.locationId}
                            >
                              <option value="">No zone</option>
                              {venue.locations.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {location.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="service-point-actions">
                          <button
                            aria-label={`Save QR point ${point.label}`}
                            className="icon-button success"
                            disabled={savingPointId === point.id}
                            onClick={() => void updateServicePoint(venue, point)}
                            type="button"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            aria-label={`Cancel editing ${point.label}`}
                            className="icon-button"
                            onClick={() => cancelEditingPoint(point.id)}
                            type="button"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <QrCode size={18} />
                        <div className="service-point-copy">
                          <strong title={point.label}>{point.label}</strong>
                          <span>{point.isActive ? "Active guest URL" : "Inactive guest URL"}</span>
                          <span className={pointLocation ? "zone-tag" : "zone-tag muted-zone"}>{zoneLabel}</span>
                        </div>
                        <div className="service-point-actions">
                          <button
                            aria-label={`Generate QR code for ${point.label}`}
                            className="icon-button"
                            onClick={() => void handleGenerateQr(publicUrl, point.label)}
                            type="button"
                          >
                            <QrCode size={15} />
                          </button>
                          <button
                            aria-label={`Copy guest URL for ${point.label}`}
                            className="icon-button"
                            onClick={() => void navigator.clipboard.writeText(publicUrl)}
                            type="button"
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            aria-label={`Edit QR point ${point.label}`}
                            className="icon-button"
                            onClick={() => startEditingPoint(point)}
                            type="button"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            aria-label={`Delete QR point ${point.label}`}
                            className="icon-button danger"
                            disabled={deletingPointId === point.id}
                            onClick={() => void deleteServicePoint(venue, point)}
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {!venue.servicePoints.length ? <div className="empty-state">No service points yet.</div> : null}
            </div>
                </>
              );
            })()}
          </article>
        ))}
      </div>

      {qrPreview ? (
        <section className="command-panel qr-preview-panel">
          <div className="qr-preview-header">
            <div>
              <strong>QR code for {qrPreview.label}</strong>
              <p className="meta">{qrPreview.url}</p>
            </div>
            <div className="qr-preview-actions">
              <button className="button" disabled={qrLoading} onClick={() => void handleDownloadQr(qrPreview.url, qrPreview.label)} type="button">
                <Download size={16} />
                Download PNG
              </button>
            </div>
          </div>
          <Image
            alt={`QR code for ${qrPreview.label}`}
            className="qr-preview-image"
            height={220}
            src={qrPreview.dataUrl}
            unoptimized
            width={220}
          />
        </section>
      ) : null}

      {!venues.length && !loading && !error ? (
        <div className="command-panel wide">
          <div className="empty-state">
            <MapPinned size={28} />
            <h2>No venues returned</h2>
            <p>Create or seed venues in Supabase, then refresh this surface.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
