import type { MetadataRoute } from "next";
import { CANONICAL_HOST } from "@/lib/hosts";

// Search engines read everything public; private areas and the API stay out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/inbox", "/new", "/account", "/auth/"] },
    sitemap: `https://${CANONICAL_HOST}/sitemap.xml`,
    host: CANONICAL_HOST,
  };
}
