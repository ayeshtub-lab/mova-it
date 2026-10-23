import { sitemapParts } from "@/server/montage/parts";
import { CARDS_PUBLIC } from "@/lib/card-styles";
import { sitemapCards } from "@/server/cards";
import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";
import { EN_INDEXED, enIndexable, inLocale } from "@/i18n/config";
import { SOUNDS } from "@/lib/sounds";
import { eventPath, findEvents } from "@/server/events";
import { topicIndex, topicPath } from "@/server/topics";
import { sitemapAuthors, sitemapEntries, sitemapShots, sitemapSoundKeys, sitemapTags, shotOrdinals, shotPath, shotTitle } from "@/server/seo";

// The pages Google should know about: the home page, public moments (with all their shots'
// pictures, for Google Images) and places with shots; each public VIDEO on its own page (Google
// Video needs a page per video) and each public photo on its own page too (since 2026-10-14, the
// owner's call: found from the map, not only through its moment — lower priority than the
// moment); the members who shot them (/u/ID, with a public shot); #hashtag pages with a few
// moments, and the sound pages people used.
// Focused (2026-10-18): Google gives a young site few visits a day, and spent them on thin pages —
// 166 pages found but never fetched, while the strong ones waited. So the map lists tags of 5
// moments or more (one spelling of each: «الارض» and «الأرض» are one), sounds on 3 shots or more,
// places of 3 shots or more. The other pages stay open to people and links; just not pushed.
// Written out by src/app/sitemap.xml/route.ts (in the order Google's schema asks — 2026-10-19).

// One tag per spelling: «خيرات_الارض» and «خيرات_الأرض» (alef with or without hamza, ى/ي, ة/ه at
// the end) are one page for a reader — the more used spelling stays.
const fold = (tag: string) => tag.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة(?=_|$)/g, "ه");
function oneSpelling<T extends { tag: string; count: number }>(tags: T[]) {
  const best = new Map<string, T>();
  for (const t of tags) {
    const key = fold(t.tag);
    const was = best.get(key);
    if (!was || t.count > was.count) best.set(key, t);
  }
  return [...best.values()];
}

export async function sitemapList(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${CANONICAL_HOST}`;
  const [{ moments, places }, shots, tags, sounds, events, topics, authors, parts, cards] = await Promise.all([
    sitemapEntries(),
    sitemapShots(),
    sitemapTags(undefined, 5),
    sitemapSoundKeys(undefined, 3),
    findEvents({ since: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }),
    topicIndex(),
    sitemapAuthors(),
    sitemapParts(),
    CARDS_PUBLIC ? sitemapCards() : [],
  ]);
  const ordinals = shotOrdinals(shots);
  // A moment lists its shots' pictures too (newest first; Google reads up to 1000 a page).
  const pictures = new Map<string, string[]>();
  for (const s of shots) {
    const list = pictures.get(s.moment.code) ?? [];
    if (list.length < 100) list.push(`${base}/i/${s.id}.jpg`);
    pictures.set(s.moment.code, list);
  }
  const list: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/album`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/guide/house`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/guide/plant`, changeFrequency: "monthly", priority: 0.8 },
    ...places.filter((p) => p.shots >= 3).map((p) => ({ url: `${base}/p/${encodeURIComponent(p.slug)}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    // «خيار في الخضر»: a place's topic pages (real ones only — src/server/topics.ts).
    ...topics.map((x) => ({ url: `${base}${topicPath(x.slug, x.topic)}`, lastModified: x.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    // A moment: its pictures.
    ...moments.map((m) => ({ url: `${base}/m/${m.code}`, lastModified: m.updatedAt, changeFrequency: "weekly" as const, priority: 0.6, images: pictures.get(m.code) })),
    // Its film in parts of up to 40 seconds (src/server/montage/parts.ts), each on its own watch page.
    ...parts.map((p) => ({
      url: `${base}/m/${p.code}/film/${p.part}`,
      lastModified: p.at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      videos: [{ title: p.title, description: `${p.title} — فيديو حقيقي من لقطات الناس على زاومو`, thumbnail_loc: `${base}/i/${p.code}-${p.part}.jpg`, content_loc: `${base}/v/${p.code}-${p.part}.mp4`, publication_date: p.at.toISOString(), ...(p.durationSec ? { duration: Math.max(1, Math.round(p.durationSec)) } : {}) }],
    })),
    // Its film (every angle in one video), on its own watch page.
    // (Not once the moment has parts — they replace it — nor an old film past 40 seconds.)
    ...moments
      .filter((m) => m.film && !parts.some((p) => p.code === m.code) && (m.film.durationSec ?? 0) <= 40.5)
      .map((m) => ({
        url: `${base}/m/${m.code}/film`,
        lastModified: m.film!.at,
        changeFrequency: "weekly" as const,
        priority: 0.5,
        videos: [{ title: `فيديو «${m.title}» من كل الزوايا`, description: `${m.title} — فيديو اللحظة من كل الزوايا على زاومو`, thumbnail_loc: `${base}/m/${m.code}/opengraph-image`, content_loc: `${base}/v/${m.code}.mp4`, publication_date: m.film!.at.toISOString(), ...(m.film!.durationSec ? { duration: Math.max(1, Math.round(m.film!.durationSec)) } : {}) }],
      })),
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
    // A photo's own page too (its picture, who shot it, where): found from the map, not only
    // through its moment.
    ...shots
      .filter((s) => s.mediaType === "PHOTO")
      .map((s) => ({ url: `${base}${shotPath(s)}`, lastModified: s.uploadedAt, changeFrequency: "monthly" as const, priority: 0.4, images: [`${base}/i/${s.id}.jpg`] })),
    // Who shot them: a member's page with their public shots (E-E-A-T).
    ...authors.map((a) => ({ url: `${base}/u/${a.id}`, lastModified: a.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    // A day's rain, snow, sunset… in one area (src/server/events.ts): 3 shots by 2 people at least.
    ...events.map((e) => ({ url: `${base}${eventPath(e)}`, lastModified: e.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...oneSpelling(tags).map((t) => ({ url: `${base}/tag/${encodeURIComponent(t.tag)}`, lastModified: t.updatedAt, changeFrequency: "daily" as const, priority: 0.6 })),
    ...SOUNDS.filter((s) => sounds.has(s.key)).map((s) => ({ url: `${base}/sound/${s.key}`, lastModified: sounds.get(s.key), changeFrequency: "weekly" as const, priority: 0.4 })),
    // «💌 بطاقات» (src/server/cards.ts sitemapCards): the page and the cards sent on, from 12 cards.
    ...(cards.length ? [{ url: `${base}/cards`, changeFrequency: "daily" as const, priority: 0.6 }] : []),
    ...cards.map((c) => ({ url: `${base}/c/${c.id}`, lastModified: c.createdAt, changeFrequency: "monthly" as const, priority: 0.4, images: [`${base}/i/card-${c.id}.jpg`] })),
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/child-safety`, changeFrequency: "yearly", priority: 0.2 },
  ];
  // Zawmo in English (2026-10-21): once the English pages are open to Google (EN_INDEXED), each of
  // phase 1's pages that has its English words gets its /en address too, both tied together
  // (hreflang), its videos under their English names.
  if (!EN_INDEXED) return list;
  const englishTitle = new Map<string, string | null>([
    [base, "Zawmo"],
    ...moments.map((m) => [`${base}/m/${m.code}`, m.titleEn] as const),
    ...parts.map((p) => [`${base}/m/${p.code}/film/${p.part}`, p.titleEn] as const),
    ...shots.map((s) => [`${base}${shotPath(s)}`, s.aiTitleEn] as const),
  ]);
  const english: MetadataRoute.Sitemap = [];
  for (const entry of list) {
    const path = entry.url.slice(base.length) || "/";
    const title = englishTitle.get(entry.url);
    if (!enIndexable(path) || !title) continue;
    const enUrl = `${base}${inLocale(path, "en")}`;
    entry.alternates = { languages: { ar: entry.url, en: enUrl, "x-default": entry.url } };
    english.push({
      ...entry,
      url: enUrl,
      videos: entry.videos?.map((v) => ({ ...v, title, description: `${title} — a real video from people on Zawmo` })),
    });
  }
  return [...list, ...english];
}
