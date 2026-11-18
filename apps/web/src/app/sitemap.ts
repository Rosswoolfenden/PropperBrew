import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { api } from "@/lib/trpc";

export const revalidate = 3600;

/** Discovery, search, and every live roaster and coffee page. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await api.beans.sitemap.query();
  return [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/search`, changeFrequency: "daily", priority: 0.6 },
    { url: `${siteUrl}/business`, changeFrequency: "monthly", priority: 0.4 },
    ...pages.map((p) => ({
      url: `${siteUrl}${p.path}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      // Roaster pages a little above their coffees.
      priority: p.path.split("/").length === 2 ? 0.8 : 0.7,
    })),
  ];
}
