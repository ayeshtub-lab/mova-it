import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";
import { sitemapEntries } from "@/server/seo";

// The pages Google should know about: the home page, public moments and places with shots.
// Rebuilt at most once an hour.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${CANONICAL_HOST}`;
  const { moments, places } = await sitemapEntries();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...places.map((p) => ({ url: `${base}/p/${encodeURIComponent(p.slug)}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...moments.map((m) => ({ url: `${base}/m/${m.code}`, lastModified: m.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
