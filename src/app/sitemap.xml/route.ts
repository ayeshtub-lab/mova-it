import type { MetadataRoute } from "next";
import { sitemapList } from "@/server/sitemap-list";

// The sitemap, written out here rather than by Next's own sitemap.ts (2026-10-19): Next puts a
// video's <video:title> before its <video:thumbnail_loc>, while Google's video-sitemap schema is a
// fixed sequence (thumbnail_loc, title, description, content_loc, … duration, publication_date) —
// Search Console counted 0 of our 169 videos. Same pages, same order of fields as the schema.
// Rebuilt at most once an hour.
export const revalidate = 3600;

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
  for (const image of e.images ?? []) parts.push(`<image:image><image:loc>${esc(image)}</image:loc></image:image>`);
  for (const v of e.videos ?? []) parts.push(video(v));
  return `<url>${parts.join("")}</url>`;
}

export async function GET() {
  const list = await sitemapList();
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
    ...list.map(entry),
    "</urlset>",
  ].join("\n");
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
