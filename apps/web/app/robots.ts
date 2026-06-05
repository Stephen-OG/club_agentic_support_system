import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://madupe.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup"],
        disallow: ["/admin", "/command", "/staff"]
      }
    ],
    sitemap: `${appUrl.replace(/\/+$/, "")}/sitemap.xml`
  };
}
