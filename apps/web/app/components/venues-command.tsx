import { MapPinned, QrCode } from "lucide-react";

export function VenuesCommand() {
  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Workspace topology</div>
          <h1>Venues & service points</h1>
        </div>
      </div>
      <div className="command-panel wide">
        <div className="empty-state">
          <MapPinned size={28} />
          <h2>Production venue controls</h2>
          <p>Venue and QR service point APIs are ready to be connected to this surface. Use the seeded workspace and service points while wiring live data.</p>
        </div>
      </div>
      <div className="command-panel">
        <h2>QR readiness</h2>
        <div className="qr-row">
          <QrCode size={26} />
          <span>Service-point tokens stay active for guest chat routes.</span>
        </div>
      </div>
    </section>
  );
}
