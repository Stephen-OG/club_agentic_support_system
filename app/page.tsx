import Link from "next/link";
import { ArrowRight, LayoutDashboard, MessageCircle, QrCode } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div>
          <h1>Club Support System</h1>
          <p>
            Table guests scan, chat naturally, and staff receive clear requests in a live dashboard.
          </p>
          <Link className="button" href="/table/demo-table-1">
            Try demo table <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="page grid two-col">
        <div className="panel">
          <h2>First MVP flow</h2>
          <p className="lead">
            Guests ask for tissues, spoons, cleaning, payment help, or safety support. The assistant replies politely, creates a staff request, and keeps the conversation open.
          </p>
          <div className="quick-actions">
            <Link className="button ghost" href="/table/demo-table-1">
              <MessageCircle size={17} /> Guest chat
            </Link>
            <Link className="button ghost" href="/admin">
              <LayoutDashboard size={17} /> Staff dashboard
            </Link>
          </div>
        </div>

        <div className="panel">
          <h2>QR ready</h2>
          <p className="lead">
            Each physical table gets a URL like <strong>/table/demo-table-1</strong>. In production, the token comes from Supabase and is printed as a QR code.
          </p>
          <QrCode size={92} strokeWidth={1.4} />
        </div>
      </section>
    </main>
  );
}
