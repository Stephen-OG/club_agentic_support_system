"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Archive, Check, Copy, Download, Edit3, MapPinned, Plus, QrCode, RefreshCw, Trash2, Upload, Utensils, X } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandMenu, CommandMenuItem, CommandMenuSection, CommandServicePoint, CommandVenue, CommandVenueLocation } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { createMenuItemPayload, createMenuSectionPayload, type MenuItemDraft, type MenuSectionDraft } from "@/lib/menu-controls";
import { generateQrCodeDataUrl } from "@/lib/qr";
import {
  createLocationPayload,
  createServicePointPayload,
  createServicePointUpdatePayload,
  servicePointGuestUrl,
  venueWideGuestUrl
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

type MenuImportResult = {
  importedCount: number;
  invalidRows: Array<{ rowNumber: number; reason: string }>;
};

function defaultMenuItemDraft(menu?: CommandMenu): MenuItemDraft {
  return {
    sectionId: menu?.sections[0]?.id ?? "",
    name: "",
    description: "",
    priceLabel: "",
    dietaryTags: "",
    allergens: "",
    available: true
  };
}

export function VenuesCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrPreview, setQrPreview] = useState<QrPreview | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [servicePointDrafts, setServicePointDrafts] = useState<Record<string, ServicePointDraft>>({});
  const [editingPointDrafts, setEditingPointDrafts] = useState<Record<string, ServicePointDraft>>({});
  const [locationDrafts, setLocationDrafts] = useState<Record<string, LocationDraft>>({});
  const [creatingPointId, setCreatingPointId] = useState<string | null>(null);
  const [creatingLocationId, setCreatingLocationId] = useState<string | null>(null);
  const [savingPointId, setSavingPointId] = useState<string | null>(null);
  const [deletingPointId, setDeletingPointId] = useState<string | null>(null);
  const [activeVenueMenuId, setActiveVenueMenuId] = useState<string | null>(null);
  const [menusByVenue, setMenusByVenue] = useState<Record<string, CommandMenu>>({});
  const [menuLoadingVenueId, setMenuLoadingVenueId] = useState<string | null>(null);
  const [menuSectionDrafts, setMenuSectionDrafts] = useState<Record<string, MenuSectionDraft>>({});
  const [menuItemDrafts, setMenuItemDrafts] = useState<Record<string, MenuItemDraft>>({});
  const [menuImportText, setMenuImportText] = useState<Record<string, string>>({});
  const [menuImportResult, setMenuImportResult] = useState<Record<string, MenuImportResult>>({});
  const [savingMenuVenueId, setSavingMenuVenueId] = useState<string | null>(null);
  const [savingMenuItemId, setSavingMenuItemId] = useState<string | null>(null);

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

  function updateMenuSectionDraft(venueId: string, patch: Partial<MenuSectionDraft>) {
    setMenuSectionDrafts((current) => ({
      ...current,
      [venueId]: {
        ...(current[venueId] ?? { name: "" }),
        ...patch
      }
    }));
  }

  function updateMenuItemDraft(venueId: string, patch: Partial<MenuItemDraft>) {
    setMenuItemDrafts((current) => ({
      ...current,
      [venueId]: {
        ...(current[venueId] ?? defaultMenuItemDraft(menusByVenue[venueId])),
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

  async function loadVenueMenu(venueId: string) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setActiveVenueMenuId(venueId);
    setMenuLoadingVenueId(venueId);
    setError(null);

    try {
      const menu = await apiRequest<CommandMenu>(supabase, `/admin/venues/${venueId}/menu`);
      setMenusByVenue((current) => ({ ...current, [venueId]: menu }));
      setMenuItemDrafts((current) =>
        current[venueId]
          ? current
          : {
              ...current,
              [venueId]: defaultMenuItemDraft(menu)
            }
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load menu");
    } finally {
      setMenuLoadingVenueId(null);
    }
  }

  function toggleVenueMenu(venueId: string) {
    if (activeVenueMenuId === venueId) {
      setActiveVenueMenuId(null);
      return;
    }

    void loadVenueMenu(venueId);
  }

  async function createMenuSection(event: FormEvent<HTMLFormElement>, venueId: string) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSavingMenuVenueId(venueId);
    setError(null);

    try {
      const draft = menuSectionDrafts[venueId] ?? { name: "" };
      const section = await apiRequest<CommandMenuSection & { items?: CommandMenuItem[] }>(supabase, `/admin/venues/${venueId}/menu/sections`, {
        method: "POST",
        body: JSON.stringify(createMenuSectionPayload(draft))
      });
      const normalizedSection: CommandMenuSection = { ...section, items: section.items ?? [] };
      setMenusByVenue((current) => ({
        ...current,
        [venueId]: {
          sections: [...(current[venueId]?.sections ?? []), normalizedSection].sort((left, right) => left.sortOrder - right.sortOrder)
        }
      }));
      setMenuSectionDrafts((current) => ({ ...current, [venueId]: { name: "" } }));
      setMenuItemDrafts((current) => ({
        ...current,
        [venueId]: {
          ...(current[venueId] ?? defaultMenuItemDraft()),
          sectionId: current[venueId]?.sectionId || normalizedSection.id
        }
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create menu section");
    } finally {
      setSavingMenuVenueId(null);
    }
  }

  async function createMenuItem(event: FormEvent<HTMLFormElement>, venueId: string) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSavingMenuVenueId(venueId);
    setError(null);

    try {
      const draft = menuItemDrafts[venueId] ?? defaultMenuItemDraft(menusByVenue[venueId]);
      const item = await apiRequest<CommandMenuItem>(supabase, `/admin/venues/${venueId}/menu/items`, {
        method: "POST",
        body: JSON.stringify(createMenuItemPayload(draft))
      });
      setMenusByVenue((current) => ({
        ...current,
        [venueId]: {
          sections: (current[venueId]?.sections ?? []).map((section) =>
            section.id === item.sectionId
              ? { ...section, items: [...section.items, item].sort((left, right) => left.sortOrder - right.sortOrder) }
              : section
          )
        }
      }));
      setMenuItemDrafts((current) => ({ ...current, [venueId]: defaultMenuItemDraft(menusByVenue[venueId]) }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create menu item");
    } finally {
      setSavingMenuVenueId(null);
    }
  }

  async function updateMenuItem(venueId: string, item: CommandMenuItem, patch: Partial<Pick<CommandMenuItem, "available">>) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSavingMenuItemId(item.id);
    setError(null);

    try {
      const updated = await apiRequest<CommandMenuItem>(supabase, `/admin/venues/${venueId}/menu/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setMenusByVenue((current) => ({
        ...current,
        [venueId]: {
          sections: (current[venueId]?.sections ?? []).map((section) => ({
            ...section,
            items: section.items.map((menuItem) => (menuItem.id === updated.id ? updated : menuItem))
          }))
        }
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update menu item");
    } finally {
      setSavingMenuItemId(null);
    }
  }

  async function archiveMenuItem(venueId: string, item: CommandMenuItem) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSavingMenuItemId(item.id);
    setError(null);

    try {
      const archived = await apiRequest<CommandMenuItem>(supabase, `/admin/venues/${venueId}/menu/items/${item.id}`, {
        method: "DELETE"
      });
      setMenusByVenue((current) => ({
        ...current,
        [venueId]: {
          sections: (current[venueId]?.sections ?? []).map((section) => ({
            ...section,
            items: section.items.map((menuItem) => (menuItem.id === archived.id ? archived : menuItem))
          }))
        }
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not archive menu item");
    } finally {
      setSavingMenuItemId(null);
    }
  }

  async function importMenuCsv(venueId: string) {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSavingMenuVenueId(venueId);
    setError(null);

    try {
      const result = await apiRequest<MenuImportResult>(supabase, `/admin/venues/${venueId}/menu/imports/csv`, {
        method: "POST",
        body: JSON.stringify({ csv: menuImportText[venueId] ?? "" })
      });
      setMenuImportResult((current) => ({ ...current, [venueId]: result }));
      await loadVenueMenu(venueId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not import menu CSV");
    } finally {
      setSavingMenuVenueId(null);
    }
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
              const menu = menusByVenue[venue.id];
              const menuSectionDraft = menuSectionDrafts[venue.id] ?? { name: "" };
              const menuItemDraft = menuItemDrafts[venue.id] ?? defaultMenuItemDraft(menu);
              const menuItemCount = menu?.sections.reduce((count, section) => count + section.items.length, 0) ?? 0;
              const menuImport = menuImportResult[venue.id];

              return (
                <>
            <div className="panel-title-row">
              <div>
                <h2>{venue.name}</h2>
                <p className="meta">{venue.timezone}</p>
              </div>
              <div className="venue-card-actions">
                <button
                  aria-label={`${activeVenueMenuId === venue.id ? "Close" : "Manage"} menu for ${venue.name}`}
                  className={activeVenueMenuId === venue.id ? "icon-button success" : "icon-button"}
                  disabled={menuLoadingVenueId === venue.id}
                  onClick={() => toggleVenueMenu(venue.id)}
                  type="button"
                >
                  <Utensils size={15} />
                </button>
                <MapPinned size={22} />
              </div>
            </div>
            <div className="venue-stats">
              <span>{venue.locations.length} zones</span>
              <span>{venue.servicePoints.length} QR points</span>
              <span>{menuItemCount} menu items</span>
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
            {activeVenueMenuId === venue.id ? (
              <section className="menu-management-panel" aria-label={`Menu management for ${venue.name}`}>
                <div className="menu-management-header">
                  <div>
                    <strong>Menu</strong>
                    <span>
                      {menuLoadingVenueId === venue.id
                        ? "Loading menu..."
                        : `${menu?.sections.length ?? 0} sections, ${menuItemCount} items`}
                    </span>
                  </div>
                  <button className="command-button secondary-action" disabled={menuLoadingVenueId === venue.id} onClick={() => void loadVenueMenu(venue.id)} type="button">
                    <RefreshCw size={15} />
                    Sync
                  </button>
                </div>
                <div className="menu-management-grid">
                  <div className="menu-section-column">
                    <form className="menu-section-form" onSubmit={(event) => void createMenuSection(event, venue.id)}>
                      <label className="field-group">
                        <span>New section</span>
                        <input
                          onChange={(event) => updateMenuSectionDraft(venue.id, { name: event.target.value })}
                          placeholder="Starters, mains, drinks..."
                          required
                          value={menuSectionDraft.name}
                        />
                      </label>
                      <button className="command-button primary" disabled={savingMenuVenueId === venue.id} type="submit">
                        <Plus size={15} />
                        Add section
                      </button>
                    </form>
                    <div className="menu-section-list">
                      {menu?.sections.map((section) => (
                        <button
                          className={menuItemDraft.sectionId === section.id ? "menu-section-pill active" : "menu-section-pill"}
                          key={section.id}
                          onClick={() => updateMenuItemDraft(venue.id, { sectionId: section.id })}
                          type="button"
                        >
                          <span>{section.name}</span>
                          <strong>{section.items.length}</strong>
                        </button>
                      ))}
                      {menu && !menu.sections.length ? <div className="empty-state">Add a section before creating items.</div> : null}
                    </div>
                  </div>
                  <div className="menu-item-column">
                    <form className="menu-item-form" onSubmit={(event) => void createMenuItem(event, venue.id)}>
                      <label className="field-group">
                        <span>Section</span>
                        <select
                          disabled={!menu?.sections.length}
                          onChange={(event) => updateMenuItemDraft(venue.id, { sectionId: event.target.value })}
                          required
                          value={menuItemDraft.sectionId}
                        >
                          <option value="">Choose section</option>
                          {menu?.sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-group">
                        <span>Item</span>
                        <input
                          onChange={(event) => updateMenuItemDraft(venue.id, { name: event.target.value })}
                          placeholder="Truffle fries"
                          required
                          value={menuItemDraft.name}
                        />
                      </label>
                      <label className="field-group">
                        <span>Price</span>
                        <input
                          onChange={(event) => updateMenuItemDraft(venue.id, { priceLabel: event.target.value })}
                          placeholder="$12"
                          value={menuItemDraft.priceLabel ?? ""}
                        />
                      </label>
                      <label className="field-group menu-description-field">
                        <span>Description</span>
                        <input
                          onChange={(event) => updateMenuItemDraft(venue.id, { description: event.target.value })}
                          placeholder="Short guest-facing description"
                          value={menuItemDraft.description ?? ""}
                        />
                      </label>
                      <label className="field-group">
                        <span>Dietary tags</span>
                        <input
                          onChange={(event) => updateMenuItemDraft(venue.id, { dietaryTags: event.target.value })}
                          placeholder="vegan, gluten-free"
                          value={menuItemDraft.dietaryTags ?? ""}
                        />
                      </label>
                      <label className="field-group">
                        <span>Allergens</span>
                        <input
                          onChange={(event) => updateMenuItemDraft(venue.id, { allergens: event.target.value })}
                          placeholder="nuts, dairy"
                          value={menuItemDraft.allergens ?? ""}
                        />
                      </label>
                      <label className="menu-availability-toggle">
                        <input
                          checked={menuItemDraft.available ?? true}
                          onChange={(event) => updateMenuItemDraft(venue.id, { available: event.target.checked })}
                          type="checkbox"
                        />
                        <span>Available</span>
                      </label>
                      <button className="command-button primary" disabled={savingMenuVenueId === venue.id || !menu?.sections.length} type="submit">
                        <Plus size={15} />
                        Add item
                      </button>
                    </form>
                    <div className="menu-item-list">
                      {menu?.sections.flatMap((section) =>
                        section.items.map((item) => (
                          <div className={item.available ? "menu-item-row" : "menu-item-row unavailable"} key={item.id}>
                            <div className="menu-item-copy">
                              <strong>{item.name}</strong>
                              <span>
                                {section.name}
                                {item.priceLabel ? ` / ${item.priceLabel}` : ""}
                              </span>
                              {item.description ? <p>{item.description}</p> : null}
                              <div className="menu-tags">
                                {item.dietaryTags.map((tag) => (
                                  <span key={`${item.id}-diet-${tag}`}>{tag}</span>
                                ))}
                                {item.allergens.map((tag) => (
                                  <span className="allergen-tag" key={`${item.id}-allergen-${tag}`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="service-point-actions">
                              <button
                                aria-label={`${item.available ? "Mark unavailable" : "Mark available"} ${item.name}`}
                                className={item.available ? "icon-button success" : "icon-button"}
                                disabled={savingMenuItemId === item.id}
                                onClick={() => void updateMenuItem(venue.id, item, { available: !item.available })}
                                type="button"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                aria-label={`Archive ${item.name}`}
                                className="icon-button danger"
                                disabled={savingMenuItemId === item.id}
                                onClick={() => void archiveMenuItem(venue.id, item)}
                                type="button"
                              >
                                <Archive size={15} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                      {menu && !menuItemCount ? <div className="empty-state">No menu items yet.</div> : null}
                    </div>
                    <div className="menu-import-box">
                      <label className="field-group">
                        <span>CSV import</span>
                        <textarea
                          onChange={(event) => setMenuImportText((current) => ({ ...current, [venue.id]: event.target.value }))}
                          placeholder="section,name,description,price,dietaryTags,allergens,available"
                          value={menuImportText[venue.id] ?? ""}
                        />
                      </label>
                      <button className="command-button secondary-action" disabled={savingMenuVenueId === venue.id} onClick={() => void importMenuCsv(venue.id)} type="button">
                        <Upload size={15} />
                        Import CSV
                      </button>
                      {menuImport ? (
                        <div className="menu-import-result">
                          <strong>{menuImport.importedCount} imported</strong>
                          {menuImport.invalidRows.length ? (
                            <ul>
                              {menuImport.invalidRows.map((row) => (
                                <li key={`${row.rowNumber}-${row.reason}`}>
                                  Row {row.rowNumber}: {row.reason}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span>No invalid rows</span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
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
