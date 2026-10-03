// Where a visitor first came from, kept in a cookie until they join (then on their account).
// First touch only: the ad that brought someone gets the credit, not the page they reloaded.
// Coarse by design — a campaign name or a site's name, never a full link or anything personal.

export const SOURCE_COOKIE = "zw_src";
export const SOURCE_DAYS = 30;
// Set by src/proxy.ts on a first arrival that has a source (never trusted from the visitor).
export const NEW_VISIT_HEADER = "x-zawmo-new-visit";

const clean = (v: string | null | undefined) =>
  (v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Known sites by the host that links to us (in-app browsers send these as referrers).
const SITES: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(t\.me|telegram\.org)$/, "telegram"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)bing\.com$/, "bing"],
];

// Every link Zawmo hands out says which door it is («?src=wa-moment», «share-video»…), so the
// numbers tell which one brings people (a link that already has a source keeps it).
export function tagged(url: string, src: string) {
  const [base, hash] = url.split("#", 2);
  if (/[?&]src=/.test(base)) return url;
  return `${base}${base.includes("?") ? "&" : "?"}src=${src}${hash !== undefined ? `#${hash}` : ""}`;
}

// «?src=tiktok-house» (our ad links), else utm_source[-utm_campaign], else the referring site.
// Null when there is nothing to tell (typed in, or from Zawmo itself).
export function sourceOf(url: URL, referrer: string | null, ownHost: string) {
  const src = clean(url.searchParams.get("src"));
  if (src) return src;
  const utm = clean(url.searchParams.get("utm_source"));
  if (utm) {
    const campaign = clean(url.searchParams.get("utm_campaign"));
    return (campaign ? `${utm}-${campaign}` : utm).slice(0, 40);
  }
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host || host === ownHost.replace(/^www\./, "") || host.endsWith(".vercel.app")) return null;
  for (const [pattern, name] of SITES) if (pattern.test(host)) return name;
  return clean(host);
}
