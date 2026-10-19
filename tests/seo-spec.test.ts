// Unit test for «حارس السيو» against Google's rules (src/lib/seo-spec.ts): it must catch exactly
// what slipped through for weeks (2026-10-19: a video's title before its cover, lastmod after the
// images — 873 errors in the live sitemap) and pass a sitemap written to the schema.
// Run: npx tsx tests/seo-spec.test.ts
import assert from "node:assert/strict";
import { sitemapProblems, structuredProblems } from "../src/lib/seo-spec";

const head = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">';
const map = (...urls: string[]) => `${head}\n${urls.join("\n")}\n</urlset>`;
const good = `<url><loc>https://zawmo.com/m/ABC123/film/1</loc><lastmod>2026-10-18T20:02:51.261Z</lastmod><changefreq>monthly</changefreq><priority>0.6</priority><image:image><image:loc>https://zawmo.com/i/x.jpg</image:loc></image:image><video:video><video:thumbnail_loc>https://zawmo.com/i/x.jpg</video:thumbnail_loc><video:title>قهوة الصباح</video:title><video:description>فيديو حقيقي</video:description><video:content_loc>https://zawmo.com/v/ABC123-1.mp4</video:content_loc><video:duration>40</video:duration><video:publication_date>2026-10-18T20:02:51.261Z</video:publication_date></video:video></url>`;
const has = (problems: string[], text: string) => assert.ok(problems.some((p) => p.includes(text)), `expected «${text}» in ${JSON.stringify(problems)}`);
let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("PASS " + name);
};

check("a sitemap written to the schema passes", () => assert.deepEqual(sitemapProblems(map(good, "<url><loc>https://zawmo.com</loc><changefreq>daily</changefreq><priority>1</priority></url>")), []));
check("a video's title before its cover is caught (what Next.js wrote)", () =>
  has(sitemapProblems(map(good.replace(/(<video:thumbnail_loc>[^<]*<\/video:thumbnail_loc>)(<video:title>[^<]*<\/video:title>)/, "$2$1"))), "video: <video:thumbnail_loc> out of order"));
check("lastmod after the images is caught (what Next.js wrote)", () =>
  has(sitemapProblems(map(good.replace(/(<lastmod>[^<]*<\/lastmod>)/, "").replace("</image:image>", "</image:image><lastmod>2026-10-18</lastmod>"))), "url: <lastmod> out of order"));
check("a video title over 100 characters is caught", () => has(sitemapProblems(map(good.replace("قهوة الصباح", "ق".repeat(101)))), "video title over 100"));
check("a video without its cover or file is caught", () => {
  has(sitemapProblems(map(good.replace(/<video:thumbnail_loc>[^<]*<\/video:thumbnail_loc>/, ""))), "video without <video:thumbnail_loc>");
  has(sitemapProblems(map(good.replace(/<video:content_loc>[^<]*<\/video:content_loc>/, ""))), "content_loc or player_loc");
});
check("bad dates, durations, hosts and namespaces are caught", () => {
  has(sitemapProblems(map(good.replace("<lastmod>2026-10-18T20:02:51.261Z", "<lastmod>18/10/2026"))), "lastmod not a W3C date");
  has(sitemapProblems(map(good.replace("<video:duration>40", "<video:duration>40.5"))), "duration");
  has(sitemapProblems(map(good.replace("https://zawmo.com/m/", "https://evil.example/m/"))), "another host");
  has(sitemapProblems(map(good).replace(' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"', "")), "video namespace missing");
});

const page = (ld: object) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;
const video = { "@type": "VideoObject", name: "قهوة", thumbnailUrl: ["https://zawmo.com/i/x.jpg"], uploadDate: "2026-10-18T20:02:51.261Z", contentUrl: "https://zawmo.com/v/x.mp4", duration: "PT40S" };
check("a complete VideoObject passes, inside an @graph too", () => {
  assert.deepEqual(structuredProblems(page(video), ["VideoObject"]), []);
  assert.deepEqual(structuredProblems(page({ "@context": "https://schema.org", "@graph": [video] }), ["VideoObject"]), []);
});
check("a VideoObject missing what Google requires is caught", () => {
  has(structuredProblems(page({ ...video, thumbnailUrl: [] })), "VideoObject without thumbnailUrl");
  has(structuredProblems(page({ ...video, contentUrl: undefined })), "contentUrl or embedUrl");
  has(structuredProblems(page({ ...video, uploadDate: "18/10/2026" })), "uploadDate not ISO");
  has(structuredProblems(page({ ...video, duration: "40" })), "duration not ISO");
});
check("a watch page without its VideoObject is caught", () => has(structuredProblems(page({ "@type": "BreadcrumbList" }), ["VideoObject"]), "no VideoObject"));

console.log(`${n} checks`);
