import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Public pages are open to search engines; people's own pages aren't. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/basket", "/checkout", "/orders", "/journal", "/subscriptions", "/business/dashboard", "/sign-in", "/forgot-password", "/reset-password", "/welcome"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
