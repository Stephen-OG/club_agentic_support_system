import { AlertTriangle, CheckCircle2, Clock3, RadioTower, ShieldAlert } from "lucide-react";

const operationRows = [
  { label: "Guest request queue", value: "Live", detail: "Prisma workflow API", tone: "ok", icon: RadioTower },
  { label: "Service recovery", value: "4.6", detail: "satisfaction trend", tone: "ok", icon: CheckCircle2 },
  { label: "Escalations", value: "2", detail: "security-aware handoffs", tone: "warn", icon: ShieldAlert },
  { label: "Response target", value: "05:00", detail: "venue SLA window", tone: "idle", icon: Clock3 }
];

const handoffQueue = [
  { title: "VIP booth support", state: "Escalated", tone: "danger" },
  { title: "Main floor payment delay", state: "In progress", tone: "warn" },
  { title: "Table 4 service recovery", state: "Monitoring", tone: "ok" }
];

export function OperationsCommand() {
  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Live operations</div>
          <h1>Operations</h1>
        </div>
        <span className="live-pill">API guarded</span>
      </div>

      <div className="metric-strip">
        {operationRows.map((item) => {
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
          <h2>Priority Handoffs</h2>
          <div className="queue-list">
            {handoffQueue.map((item) => (
              <div className="queue-row" key={item.title}>
                <span className={`severity-dot ops-dot-${item.tone}`} />
                <strong>{item.title}</strong>
                <span>{item.state}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="command-panel ops-incident-panel">
          <span className="ops-incident-icon">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2>Control State</h2>
            <p className="meta">Workspace access is enforced for every handoff, request update, and staff action.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
