// «حارس السيو» against Google's own rules (2026-10-19): what Zawmo hands to search engines is
// checked against the official specs, not against how it looks to us. The live sitemap had 873
// errors for weeks (Next.js wrote a video's title before its cover, and lastmod after the images)
// and nothing of ours noticed — the owner did, by chance. These checks run on every deploy and every
// 30 minutes (src/server/smoke.ts), and in the tests. Plain string work: runs anywhere.
//
// Sitemap: https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd,
//          https://www.google.com/schemas/sitemap-image/1.1/sitemap-image.xsd,
//          https://www.google.com/schemas/sitemap-video/1.1/sitemap-video.xsd (an xsd:sequence).
// Structured data: Google's required properties for VideoObject and ImageObject.

// The children of <url>, in the order the schema allows (loc, lastmod, changefreq, priority, then
// the extensions), and of <video:video> (the schema's sequence; we use the first part of it).
// hreflang (https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap):
// <xhtml:link rel="alternate" hreflang="…" href="…"/>, each address listing every language, itself
// included, and each of them listing it back.
const URL_ORDER = ["loc", "lastmod", "changefreq", "priority", "xhtml:link", "image:image", "video:video"];
const HREFLANG = /^([a-z]{2,3}(-[A-Za-z]{2,4})?|x-default)$/;
const VIDEO_ORDER = ["video:thumbnail_loc", "video:title", "video:description", "video:content_loc", "video:player_loc", "video:duration", "video:expiration_date", "video:rating", "video:content_segment_loc", "video:view_count", "video:publication_date"];
const FREQ = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
const W3C_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// The direct children of an element's inner XML: their names in order, and their text.
// (Self-closing ones too — <xhtml:link …/> — with their attributes.)
function children(inner: string) {
  const out: { name: string; body: string; attrs: Record<string, string> }[] = [];
  const re = /<([a-z]+(?::[a-z_]+)?)(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (let m = re.exec(inner); m; m = re.exec(inner)) {
    const attrs = Object.fromEntries([...(m[2] ?? "").matchAll(/([a-z_:-]+)="([^"]*)"/gi)].map((a) => [a[1], unescape(a[2])]));
    out.push({ name: m[1], body: m[3] ?? "", attrs });
  }
  return out;
}

function inOrder(names: string[], order: string[]) {
  let at = -1;
  for (const name of names) {
    const i = order.indexOf(name);
    if (i < 0) return `unexpected <${name}>`;
    if (i < at) return `<${name}> out of order`;
    at = i;
  }
  return null;
}

// Every problem found in a sitemap (none: it meets the spec). Problems of one kind are counted
// once, with how many there are and the first place they were seen.
export function sitemapProblems(xml: string, host = "https://zawmo.com"): string[] {
  const found = new Map<string, { count: number; first: string }>();
  const note = (what: string, where: string) => {
    const was = found.get(what);
    found.set(what, { count: (was?.count ?? 0) + 1, first: was?.first ?? where });
  };
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(xml.trimStart())) note("no XML declaration", "start");
  if (!/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(xml)) note("urlset namespace", "start");
  if (xml.includes("<video:") && !xml.includes('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"')) note("video namespace missing", "start");
  if (xml.includes("<image:") && !xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')) note("image namespace missing", "start");
  if (xml.includes("<xhtml:") && !xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) note("xhtml namespace missing", "start");
  if (Buffer.byteLength(xml) > 50 * 1024 * 1024) note("larger than 50 MB", "file");

  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  if (!urls.length) note("no <url>", "file");
  if (urls.length > 50_000) note("more than 50,000 urls", "file");
  const languages = new Map<string, Set<string>>();
  for (const inner of urls) {
    const parts = children(inner);
    const loc = unescape(parts.find((p) => p.name === "loc")?.body ?? "");
    const where = loc || inner.slice(0, 60);
    if (!loc) note("url without <loc>", where);
    else if (!loc.startsWith(host)) note("loc on another host", where);
    else if (loc.length > 2048) note("loc longer than 2048", where);
    const order = inOrder(parts.map((p) => p.name), URL_ORDER);
    if (order) note(`url: ${order}`, where);
    const links = parts.filter((p) => p.name === "xhtml:link");
    if (links.length) {
      for (const l of links) {
        if (l.attrs.rel !== "alternate") note("hreflang link without rel=alternate", where);
        if (!HREFLANG.test(l.attrs.hreflang ?? "")) note("hreflang not a language code", where);
        if (!(l.attrs.href ?? "").startsWith(host)) note("hreflang href on another host", where);
      }
      const codes = links.map((l) => l.attrs.hreflang);
      if (new Set(codes).size !== codes.length) note("hreflang code listed twice", where);
      if (!links.some((l) => l.attrs.href === loc)) note("hreflang links don't include the page itself", where);
      languages.set(loc, new Set(links.map((l) => l.attrs.href)));
    }
    for (const p of parts) {
      if (p.name === "lastmod" && !W3C_DATE.test(p.body)) note("lastmod not a W3C date", where);
      if (p.name === "changefreq" && !FREQ.has(p.body)) note("changefreq not allowed", where);
      if (p.name === "priority" && !(Number(p.body) >= 0 && Number(p.body) <= 1)) note("priority outside 0–1", where);
      if (p.name === "image:image" && !/<image:loc>https?:\/\/[^<]+<\/image:loc>/.test(p.body)) note("image without image:loc", where);
      if (p.name !== "video:video") continue;
      const v = children(p.body);
      const names = v.map((x) => x.name);
      const vo = inOrder(names, VIDEO_ORDER);
      if (vo) note(`video: ${vo}`, where);
      for (const need of ["video:thumbnail_loc", "video:title", "video:description"]) if (!names.includes(need)) note(`video without <${need}>`, where);
      if (!names.includes("video:content_loc") && !names.includes("video:player_loc")) note("video without content_loc or player_loc", where);
      const text = (name: string) => unescape(v.find((x) => x.name === name)?.body ?? "");
      if ([...text("video:title")].length > 100) note("video title over 100 characters", where);
      if ([...text("video:description")].length > 2048) note("video description over 2048 characters", where);
      const duration = text("video:duration");
      if (duration && !(/^\d+$/.test(duration) && +duration >= 1 && +duration <= 28800)) note("video duration not 1–28800 seconds", where);
      const published = text("video:publication_date");
      if (published && !W3C_DATE.test(published)) note("video publication_date not a W3C date", where);
    }
  }
  for (const [loc, hrefs] of languages) {
    for (const href of hrefs) if (href !== loc && languages.has(href) && !languages.get(href)!.has(loc)) note("hreflang not returned (the other language doesn't link back)", loc);
  }
  return [...found].map(([what, { count, first }]) => `${what} ×${count} (e.g. ${first})`);
}

// The JSON-LD on a page, its @graph flattened.
function structured(html: string) {
  const items: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown> | Record<string, unknown>[];
      for (const node of Array.isArray(data) ? data : [data]) {
        if (Array.isArray(node["@graph"])) items.push(...(node["@graph"] as Record<string, unknown>[]));
        else items.push(node);
      }
    } catch {
      items.push({ "@type": "(unreadable JSON-LD)" });
    }
  }
  return items;
}

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 && v.every(filled) : typeof v === "string" ? v.trim().length > 0 : v != null);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// What Google needs on a page's structured data: a VideoObject's name, thumbnailUrl, uploadDate
// (with its time zone) and contentUrl or embedUrl; an ImageObject's contentUrl. `needs`: types the
// page must carry (a watch page without its VideoObject is a problem too).
export function structuredProblems(html: string, needs: string[] = []): string[] {
  const problems: string[] = [];
  const items = structured(html);
  const types = new Set(items.flatMap((i) => [i["@type"]].flat().map(String)));
  if (types.has("(unreadable JSON-LD)")) problems.push("unreadable JSON-LD");
  for (const t of needs) if (!types.has(t)) problems.push(`no ${t}`);
  for (const item of items) {
    const type = [item["@type"]].flat().map(String);
    if (type.includes("VideoObject")) {
      for (const key of ["name", "thumbnailUrl", "uploadDate"]) if (!filled(item[key])) problems.push(`VideoObject without ${key}`);
      if (!filled(item.contentUrl) && !filled(item.embedUrl)) problems.push("VideoObject without contentUrl or embedUrl");
      if (filled(item.uploadDate) && !ISO.test(String(item.uploadDate))) problems.push("VideoObject uploadDate not ISO 8601 with time");
      if (filled(item.duration) && !/^PT(\d+H)?(\d+M)?(\d+S)?$/.test(String(item.duration))) problems.push("VideoObject duration not ISO 8601");
    }
    if (type.includes("ImageObject") && !filled(item.contentUrl) && !filled(item.url)) problems.push("ImageObject without contentUrl");
  }
  return [...new Set(problems)];
}
