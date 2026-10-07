import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";
import { SOUNDS } from "@/lib/sounds";
import { sitemapEntries, sitemapShots, sitemapSoundKeys, sitemapTags, shotOrdinals, shotPath, shotTitle } from "@/server/seo";

// The pages Google should know about: the home page, public moments (with all their shots'
// pictures, for Google Images) and places with shots; each public VIDEO on its own page (Google
// Video needs a page per video); #hashtag pages with a few moments, and the sound pages people
// used. A new site gets little of Google's time: a photo's own page (a picture and a line) is
// left out — its picture is listed with its moment, the stronger page — so Google spends it on
// pages worth showing. Those pages still open, and moments link to them.
// Rebuilt at most once an hour.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${CANONICAL_HOST}`;
  const [{ moments, places }, shots, tags, sounds] = await Promise.all([sitemapEntries(), sitemapShots(), sitemapTags(), sitemapSoundKeys()]);
  const ordinals = shotOrdinals(shots);
  // A moment lists its shots' pictures too (newest first; Google reads up to 1000 a page).
  const pictures = new Map<string, string[]>();
  for (const s of shots) {
    const list = pictures.get(s.moment.code) ?? [];
    if (list.length < 100) list.push(`${base}/i/${s.id}.jpg`);
    pictures.set(s.moment.code, list);
  }
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/album`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/guide/house`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/guide/plant`, changeFrequency: "monthly", priority: 0.8 },
    ...places.map((p) => ({ url: `${base}/p/${encodeURIComponent(p.slug)}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...moments.map((m) => ({ url: `${base}/m/${m.code}`, lastModified: m.updatedAt, changeFrequency: "weekly" as const, priority: 0.6, images: pictures.get(m.code) })),
    ...shots.filter((s) => s.mediaType === "VIDEO").map((s) => {
      const title = shotTitle(s, "ar", ordinals.get(s.id));
      const image = `${base}/i/${s.id}.jpg`;
      return {
        url: `${base}${shotPath(s)}`,
        lastModified: s.uploadedAt,
        changeFrequency: "monthly" as const,
        priority: 0.5,
        images: [image],
        videos: [{ title, description: `${title} — ${s.contributor.displayName}`, thumbnail_loc: image, content_loc: `${base}/v/${s.id}.mp4`, publication_date: s.uploadedAt.toISOString(), ...(s.durationSec ? { duration: Math.max(1, Math.round(s.durationSec)) } : {}) }],
      };
    }),
    ...tags.map((t) => ({ url: `${base}/tag/${encodeURIComponent(t.tag)}`, lastModified: t.updatedAt, changeFrequency: "daily" as const, priority: 0.6 })),
    ...SOUNDS.filter((s) => sounds.has(s.key)).map((s) => ({ url: `${base}/sound/${s.key}`, lastModified: sounds.get(s.key), changeFrequency: "weekly" as const, priority: 0.4 })),
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
