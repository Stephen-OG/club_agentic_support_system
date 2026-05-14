import { Activity, BellRing, MapPinned, Star } from "lucide-react";

export function CommandCenterDashboard() {
  const metrics = [
    { label: "Active requests", value: "18", detail: "5 high priority", icon: BellRing },
    { label: "Open venues", value: "3", detail: "2 in service", icon: MapPinned },
    { label: "Avg satisfaction", value: "4.6", detail: "last 24h", icon: Star },
    { label: "Live signals", value: "92%", detail: "queue health", icon: Activity }
  ];

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Operations overview</div>
          <h1>Command Center</h1>
        </div>
        <span className="live-pill">Live</span>
      </div>
      <div className="metric-strip">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="command-metric" key={metric.label}>
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
      <div className="command-panel wide">
        <h2>Priority queue</h2>
        <div className="queue-list">
          {["VIP booth needs security support", "Table 12 waiting on payment", "Bar area spill cleanup"].map((item, index) => (
            <div className="queue-row" key={item}>
              <span className={`severity-dot severity-${index}`} />
              <strong>{item}</strong>
              <span>{index === 0 ? "Urgent" : "In progress"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
