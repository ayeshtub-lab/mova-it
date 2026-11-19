import { SITEMAP_HEADERS, sitemapXml } from "@/lib/sitemap-xml";
import { sitemapList } from "@/server/sitemap-list";

// The sitemap, written out here rather than by Next's own sitemap.ts (2026-10-19): Next puts a
// video's <video:title> before its <video:thumbnail_loc>, while Google's video-sitemap schema is a
// fixed sequence (thumbnail_loc, title, description, content_loc, … duration, publication_date) —
// Search Console counted 0 of our 169 videos. Same pages, same order of fields as the schema.
// Rebuilt at most once an hour, by the CDN (2026-11-01: as a page rebuilt by Next every hour it was
// never rebuilt at all — the sitemap stayed as it was at the last deploy, a day or more behind).
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(sitemapXml(await sitemapList()), { headers: SITEMAP_HEADERS });
}
