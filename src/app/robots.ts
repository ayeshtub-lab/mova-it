import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";

// Search engines read everything public; private areas and the API stay out.
// And the links' prefetches (?_rsc=…, 2026-10-29): when Google renders a page, every link on it
// fetched its next page's data in the background — 52% of Googlebot's visits went to these
// («other file type» in the crawl stats, HTML only 13%), each one waking the server and the
// database. A page renders whole without them; the pages themselves stay open.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/inbox", "/new", "/account", "/auth/", "/*?_rsc=", "/*&_rsc="] },
    sitemap: `https://${CANONICAL_HOST}/sitemap.xml`,
    host: CANONICAL_HOST,
  };
}
