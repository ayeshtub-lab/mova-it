import { SITEMAP_HEADERS, sitemapXml } from "@/lib/sitemap-xml";
import { sitemapList } from "@/server/sitemap-list";

// Zawmo in English, a map of its own (2026-11-20, his OK): the 200 strongest English pages (home,
// moments, films, shots — each tied to its Arabic twin with hreflang), apart from the Arabic map so
// Search Console counts them on their own. Rebuilt at most once an hour, by the CDN.
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(sitemapXml(await sitemapList("en")), { headers: SITEMAP_HEADERS });
}
