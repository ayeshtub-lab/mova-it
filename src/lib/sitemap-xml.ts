import type { MetadataRoute } from "next";

// A sitemap written out in the order Google's schemas ask (src/app/sitemap.xml/route.ts, 2026-10-19),
// shared by the Arabic map and the English one (src/app/sitemap-en.xml, 2026-11-20).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const day = (d: string | Date | undefined) => (d ? new Date(d).toISOString() : null);
// The schema's limits: a title of 100 characters at most, a description of 2048 — cut at a word.
const clip = (s: string, max: number) => {
  const chars = [...s];
  if (chars.length <= max) return s;
  const cut = chars.slice(0, max - 1).join("");
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2)).trim()}…`;
};

type Entry = MetadataRoute.Sitemap[number];
type Video = NonNullable<Entry["videos"]>[number];

function video(v: Video) {
  // Schema order (https://www.google.com/schemas/sitemap-video/1.1/sitemap-video.xsd).
  return [
    "<video:video>",
    `<video:thumbnail_loc>${esc(v.thumbnail_loc)}</video:thumbnail_loc>`,
    `<video:title>${esc(clip(v.title, 100))}</video:title>`,
    `<video:description>${esc(clip(v.description, 2048))}</video:description>`,
    v.content_loc ? `<video:content_loc>${esc(v.content_loc)}</video:content_loc>` : "",
    v.player_loc ? `<video:player_loc>${esc(v.player_loc)}</video:player_loc>` : "",
    v.duration != null ? `<video:duration>${Math.round(v.duration)}</video:duration>` : "",
    v.publication_date ? `<video:publication_date>${esc(day(v.publication_date)!)}</video:publication_date>` : "",
    "</video:video>",
  ].join("");
}

function entry(e: Entry) {
  const parts = [`<loc>${esc(e.url)}</loc>`];
  const lastmod = day(e.lastModified);
  if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`);
  if (e.changeFrequency) parts.push(`<changefreq>${e.changeFrequency}</changefreq>`);
  if (e.priority != null) parts.push(`<priority>${e.priority}</priority>`);
  // Its other languages (hreflang — src/server/sitemap-list.ts, once the English pages are open).
  for (const [lang, href] of Object.entries(e.alternates?.languages ?? {})) {
    if (href) parts.push(`<xhtml:link rel="alternate" hreflang="${esc(lang)}" href="${esc(String(href))}"/>`);
  }
  for (const image of e.images ?? []) parts.push(`<image:image><image:loc>${esc(image)}</image:loc></image:image>`);
  for (const v of e.videos ?? []) parts.push(video(v));
  return `<url>${parts.join("")}</url>`;
}

export function sitemapXml(list: MetadataRoute.Sitemap) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...list.map(entry),
    "</urlset>",
  ].join("\n");
}

export const SITEMAP_HEADERS = { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=3600" };
