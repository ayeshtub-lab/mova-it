import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";

// Search engines read everything public; private areas and the API stay out.
// And the links' prefetches (?_rsc=…, 2026-10-29): when Google renders a page, every link on it
// fetched its next page's data in the background — 52% of Googlebot's visits went to these
// («other file type» in the crawl stats, HTML only 13%), each one waking the server and the
// database. A page renders whole without them; the pages themselves stay open.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/inbox", "/new", "/account", "/auth/", "/*?_rsc=", "/*&_rsc="] },
      // Meta's crawler for training its AI (2026-11-18): 30K of 152K requests a week, no visitor in
      // return. Only it — facebookexternalhit (the picture when a link is shared on Facebook or
      // WhatsApp) and Meta-ExternalFetcher (a person's own request) are other names and stay open.
      { userAgent: "meta-externalagent", disallow: "/" },
    ],
    sitemap: `https://${CANONICAL_HOST}/sitemap.xml`,
    host: CANONICAL_HOST,
  };
}
