"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, MapPinned, QrCode, RefreshCw } from "lucide-react";
import { apiBaseUrl, apiRequest } from "@/lib/api/client";
import type { CommandVenue } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function VenuesCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
            <div className="service-point-list">
              {venue.servicePoints.map((point) => {
                const publicUrl = `${apiBaseUrl}/public/qr/${point.qrToken}/messages`;
                return (
                  <div className="service-point-row" key={point.id}>
                    <QrCode size={18} />
                    <div>
                      <strong>{point.label}</strong>
                      <span>{point.isActive ? "Active" : "Inactive"} token</span>
                    </div>
                    <button
                      aria-label={`Copy QR token for ${point.label}`}
                      className="icon-button"
                      onClick={() => void navigator.clipboard.writeText(publicUrl)}
                      type="button"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                );
              })}
              {!venue.servicePoints.length ? <div className="empty-state">No service points yet.</div> : null}
            </div>
          </article>
        ))}
      </div>

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
