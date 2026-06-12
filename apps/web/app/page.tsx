import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, MessageSquareText, QrCode, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { getAuthEntryHref } from "@/lib/auth/signup-flow";

export const metadata: Metadata = {
  title: "Madupe | QR guest support for live venues",
  description:
    "Madupe turns venue QR scans into live service requests, routed staff queues, and guest-visible status updates.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Madupe | QR guest support for live venues",
    description:
      "Capture guest requests from QR codes, route them to staff, and close the loop from one venue command center.",
    type: "website",
    url: "/"
  }
};

const workflow = [
  {
    title: "Scan",
    body: "Guests scan a venue or service-point QR code from the table, bar, room, or event floor.",
    icon: QrCode
  },
  {
    title: "Request",
    body: "They ask for help in plain language: missing drinks, payment support, spills, access needs, or urgent issues.",
    icon: MessageSquareText
  },
  {
    title: "Route",
    body: "Madupe classifies the request, applies priority rules, and places it in the right staff queue.",
    icon: Sparkles
  },
  {
    title: "Resolve",
    body: "Staff acknowledge, progress, complete, and get guest confirmation when the issue is handled.",
    icon: CheckCircle2
  }
];

const venueUseCases = [
  "Bars and clubs",
  "Restaurants",
  "Hotels",
  "Event venues",
  "VIP areas",
  "Multi-zone hospitality teams"
];

const trustPoints = [
  "Encrypted guest message storage",
  "Role-based staff access",
  "Rate-limited public QR endpoints",
  "Guest sessions kept out of URLs"
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav" aria-label="Primary navigation">
        <Link className="landing-brand" href="/">
          <span className="landing-brand-mark" aria-hidden="true">
            M
          </span>
          <span>Madupe</span>
        </Link>

        <nav className="landing-links" aria-label="Product navigation">
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
        </nav>

        <div className="landing-actions">
          <Link className="landing-link-button" href={getAuthEntryHref("signin")}>
            Sign in
          </Link>
          <Link className="landing-primary-button" href={getAuthEntryHref("signup")}>
            Create account
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>Turn every guest QR scan into a live service request.</h1>
          <p>
            Madupe helps venues capture guest requests from QR codes, route them to staff, and close the loop with
            guest-visible status updates.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-button large" href={getAuthEntryHref("signup")}>
              Create account
              <ArrowRight size={18} />
            </Link>
            <Link className="landing-secondary-button large" href={getAuthEntryHref("signin")}>
              Sign in
            </Link>
          </div>
        </div>

        <div className="landing-product-preview" id="product" aria-label="Madupe product workflow preview">
          <div className="preview-toolbar">
            <span>Venue floor</span>
            <span>Live queue</span>
          </div>
          <div className="preview-grid">
            <section className="preview-phone" aria-label="Guest chat preview">
              <div className="phone-speaker" />
              <div className="phone-title">Table 14</div>
              <div className="chat-bubble guest">Our drinks have not arrived yet.</div>
              <div className="chat-bubble assistant">I have let the team know. You can follow the status here.</div>
              <div className="status-strip">Request created · Normal priority</div>
            </section>

            <section className="preview-queue" aria-label="Staff queue preview">
              <div className="queue-head">
                <span>Active requests</span>
                <strong>04</strong>
              </div>
              <article className="queue-row urgent">
                <span>Security support</span>
                <strong>Urgent</strong>
              </article>
              <article className="queue-row">
                <span>Missing drinks · Table 14</span>
                <strong>New</strong>
              </article>
              <article className="queue-row">
                <span>Payment help · Bar</span>
                <strong>In progress</strong>
              </article>
            </section>
          </div>
        </div>
      </section>

      <section className="landing-workflow" id="workflow" aria-labelledby="workflow-heading">
        <div className="landing-section-copy">
          <h2 id="workflow-heading">Built for the moments staff usually miss.</h2>
          <p>
            Guests should not have to wave, queue, repeat themselves, or wonder whether anyone heard them. Madupe gives
            every request a visible operational path.
          </p>
        </div>
        <div className="workflow-steps">
          {workflow.map((item) => {
            const Icon = item.icon;
            return (
              <article className="workflow-step" key={item.title}>
                <Icon size={22} />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-band" aria-labelledby="venues-heading">
        <div>
          <h2 id="venues-heading">For live hospitality teams.</h2>
          <p>
            Run venue-wide QR intake or attach service points to rooms, tables, booths, bars, zones, and VIP areas. Staff see
            structured requests instead of scattered verbal handoffs.
          </p>
        </div>
        <ul className="venue-list" aria-label="Venue types">
          {venueUseCases.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="landing-command" aria-labelledby="command-heading">
        <div className="command-copy">
          <h2 id="command-heading">One command center for requests, staff, and resolution.</h2>
          <p>
            Priorities, assignments, guest-visible updates, ratings, opening hours, and QR service points sit together
            so managers can understand service pressure while staff keep moving.
          </p>
          <Link className="landing-secondary-button" href={getAuthEntryHref("signin")}>
            Open command center
          </Link>
        </div>
        <div className="command-panel" aria-label="Command center capability list">
          <div className="command-row">
            <UsersRound size={18} />
            <span>Venue-scoped staff roles</span>
          </div>
          <div className="command-row">
            <QrCode size={18} />
            <span>Service points for zones</span>
          </div>
          <div className="command-row">
            <MessageSquareText size={18} />
            <span>Guest conversation history</span>
          </div>
          <div className="command-row">
            <ShieldCheck size={18} />
            <span>Safety escalation rules</span>
          </div>
        </div>
      </section>

      <section className="landing-security" id="security" aria-labelledby="security-heading">
        <div>
          <LockKeyhole size={24} />
          <h2 id="security-heading">Clear public access. Protected operations.</h2>
          <p>
            Public QR chat is intentionally narrow and rate-limited. Operational dashboards require authenticated staff
            access, organization membership, and venue permissions.
          </p>
        </div>
        <ul>
          {trustPoints.map((point) => (
            <li key={point}>
              <CheckCircle2 size={18} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand" href="/">
          <span className="landing-brand-mark" aria-hidden="true">
            M
          </span>
          <span>Madupe</span>
        </Link>
        <p>QR guest support and live venue operations.</p>
        <div>
          <Link href={getAuthEntryHref("signin")}>Sign in</Link>
          <Link href={getAuthEntryHref("signup")}>Create account</Link>
        </div>
      </footer>
    </main>
  );
}
