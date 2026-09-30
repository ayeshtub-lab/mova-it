import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";
import { sitemapEntries, sitemapShots, shotLabel, shotPath } from "@/server/seo";

// The pages Google should know about: the home page, public moments and places with shots,
// and each public shot on its own page with its picture (and video) for Google Images / Video.
// Rebuilt at most once an hour.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${CANONICAL_HOST}`;
  const [{ moments, places }, shots] = await Promise.all([sitemapEntries(), sitemapShots()]);
  // A moment lists its shots' pictures too (a few, newest first).
  const pictures = new Map<string, string[]>();
  for (const s of shots) {
    const list = pictures.get(s.moment.code) ?? [];
    if (list.length < 20) list.push(`${base}/i/${s.id}.jpg`);
    pictures.set(s.moment.code, list);
  }
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/album`, changeFrequency: "monthly", priority: 0.9 },
    ...places.map((p) => ({ url: `${base}/p/${encodeURIComponent(p.slug)}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...moments.map((m) => ({ url: `${base}/m/${m.code}`, lastModified: m.updatedAt, changeFrequency: "weekly" as const, priority: 0.6, images: pictures.get(m.code) })),
    ...shots.map((s) => {
      const title = shotLabel(s, "ar");
      const image = `${base}/i/${s.id}.jpg`;
      return {
        url: `${base}${shotPath(s)}`,
        lastModified: s.uploadedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
        images: [image],
        ...(s.mediaType === "VIDEO"
          ? { videos: [{ title, description: `${title} — ${s.contributor.displayName}`, thumbnail_loc: image, content_loc: `${base}/v/${s.id}.mp4`, publication_date: s.uploadedAt.toISOString(), ...(s.durationSec ? { duration: Math.max(1, Math.round(s.durationSec)) } : {}) }] }
          : {}),
      };
    }),
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
