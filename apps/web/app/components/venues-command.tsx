"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, MapPinned, QrCode, RefreshCw } from "lucide-react";
import { apiBaseUrl, apiRequest } from "@/lib/api/client";
import type { CommandVenue } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { generateQrCodeDataUrl } from "@/lib/qr";

type QrPreview = {
  label: string;
  url: string;
  dataUrl: string;
};

export function VenuesCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrPreview, setQrPreview] = useState<QrPreview | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

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
                const guestAppUrl = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
                const publicUrl = `${guestAppUrl}/table/${point.qrToken}`;
                return (
                  <div className="service-point-row" key={point.id}>
                    <QrCode size={18} />
                    <div>
                      <strong>{point.label}</strong>
                      <span>{point.isActive ? "Active" : "Inactive"} guest URL</span>
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
                    </div>
                  </div>
                );
              })}
              {!venue.servicePoints.length ? <div className="empty-state">No service points yet.</div> : null}
            </div>
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
          <img className="qr-preview-image" src={qrPreview.dataUrl} alt={`QR code for ${qrPreview.label}`} />
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
