import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerInit } from "./sw-init";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://madupe.com"),
  title: "Madupe Command Center",
  description: "Production command center for venue guest support",
  applicationName: "Madupe",
  icons: {
    icon: "/icon.svg"
  },
  openGraph: {
    siteName: "Madupe",
    type: "website"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#061015"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerInit />
        {children}
      </body>
    </html>
  );
}
