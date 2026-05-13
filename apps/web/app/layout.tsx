import type { Metadata } from "next";
import Link from "next/link";
import { ConciergeBell } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Club Support System",
  description: "Conversational table support for clubs and venues"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <ConciergeBell size={18} />
              </span>
              Club Support
            </Link>
            <nav className="nav-links" aria-label="Primary navigation">
              <Link href="/table/demo-table-1">Guest chat</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
