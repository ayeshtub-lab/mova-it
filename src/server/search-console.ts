import * as Sentry from "@sentry/nextjs";
import { createSign } from "node:crypto";
import { cache } from "react";
import { db } from "@/lib/db";

// What people really type in Google to find Zawmo (Google Search Console, read only): every
// Monday the last 28 days of searches — web and images — are kept (SearchTerm), so that
//  • Gemini, describing a shot, knows the searches that already bring people here and uses
//    one when it truly describes what is seen (src/server/screening.ts);
//  • «🔎 السيو» (/admin/seo) shows the searches with the most impressions and the most clicks,
//    week on week.
// It needs a Google service account with read access to the property: its JSON key (pasted as
// it is, or base64) in GSC_SERVICE_ACCOUNT. Without it nothing is fetched and nothing breaks.

const PROPERTY = "sc-domain:zawmo.com";
const TYPES = ["web", "image"] as const;
type SearchType = (typeof TYPES)[number];

export const searchConsoleEnabled = () => !!process.env.GSC_SERVICE_ACCOUNT;

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

// A short-lived access token from the service account's key (a signed JWT, as Google asks).
async function accessToken() {
  const raw = process.env.GSC_SERVICE_ACCOUNT!.trim();
  const key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(signature)}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function fetchTerms(token: string, type: SearchType) {
  // Search Console's numbers settle after ~2 days: the 28 days ending 2 days ago.
  const end = new Date(Date.now() - 2 * 86400e3);
  const start = new Date(end.getTime() - 27 * 86400e3);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate: isoDay(start), endDate: isoDay(end), dimensions: ["query"], type, rowLimit: 500 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`search analytics ${type} ${res.status}`);
  const body = (await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] };
  return (body.rows ?? []).map((r) => ({ query: r.keys[0].slice(0, 200), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: r.position }));
}

// The weekly snapshot (Mondays, from the cron «reminders»); once a day at most.
export async function saveSearchTerms(now = new Date()) {
  if (!searchConsoleEnabled()) return 0;
  const day = isoDay(now);
  if (await db.searchTerm.count({ where: { day } })) return 0;
  const token = await accessToken();
  let saved = 0;
  for (const type of TYPES) {
    const rows = await fetchTerms(token, type);
    if (!rows.length) continue;
    await db.searchTerm.createMany({ data: rows.map((r) => ({ day, type, ...r })), skipDuplicates: true });
    saved += rows.length;
  }
  return saved;
}

export type TermRow = { query: string; type: string; clicks: number; impressions: number; position: number; before: { clicks: number; impressions: number; position: number } | null };

// The latest snapshot, each search with last week's numbers beside it.
export async function searchReport() {
  const days = await db.searchTerm.findMany({ distinct: ["day"], select: { day: true }, orderBy: { day: "desc" }, take: 2 });
  if (!days.length) return { day: null, rows: [] as TermRow[] };
  const [latest, previous] = await Promise.all(days.map((d) => db.searchTerm.findMany({ where: { day: d.day } })));
  const was = new Map((previous ?? []).map((r) => [`${r.type}|${r.query}`, r]));
  const rows: TermRow[] = latest.map((r) => {
    const b = was.get(`${r.type}|${r.query}`);
    return { query: r.query, type: r.type, clicks: r.clicks, impressions: r.impressions, position: r.position, before: b ? { clicks: b.clicks, impressions: b.impressions, position: b.position } : null };
  });
  return { day: days[0].day, rows };
}

// For Gemini: the searches that already bring people to Zawmo — the most shown and the most
// clicked first (a click counts as ten impressions) — never the site's own name.
export const searchesForGemini = cache(async (take = 30) => {
  const latest = await db.searchTerm.findFirst({ orderBy: { day: "desc" }, select: { day: true } });
  if (!latest) return [] as string[];
  const rows = await db.searchTerm.findMany({ where: { day: latest.day }, select: { query: true, clicks: true, impressions: true } });
  const score = new Map<string, number>();
  for (const r of rows) {
    if (/زاوم|زموو|zawmo/i.test(r.query)) continue;
    score.set(r.query, (score.get(r.query) ?? 0) + r.impressions + r.clicks * 10);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, take).map(([q]) => q);
});

// ── The weekly SEO check (2026-10-19) ──────────────────────────────────────────────────────────
// Mondays, with the searches above: what Search Console itself says, so a problem is seen by us and
// not found by chance (the sitemap's 873 schema errors were):
//  • the sitemap Google read: when, its errors and warnings, what it found in it;
//  • a sample of pages — the home page, the newest moments, film parts and shots — inspected one
//    by one (URL Inspection): indexed or not, and when Google last fetched each.
// Sent to error monitoring as «SEO weekly» — a warning when something is wrong (errors in the
// sitemap, or fewer than half of the sample indexed), so the error watch picks it up.
type SitemapStatus = { path: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { type: string; submitted?: string }[] };
type Inspection = { url: string; verdict: string; coverage: string; lastCrawl: string | null; canonical: string | null };

async function inspect(token: string, url: string): Promise<Inspection> {
  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: PROPERTY, languageCode: "en" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { url, verdict: `error ${res.status}`, coverage: "", lastCrawl: null, canonical: null };
  const r = ((await res.json()) as { inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string; googleCanonical?: string } } }).inspectionResult?.indexStatusResult;
  return { url, verdict: r?.verdict ?? "?", coverage: r?.coverageState ?? "", lastCrawl: r?.lastCrawlTime ?? null, canonical: r?.googleCanonical ?? null };
}

// Arabic and English apart (2026-10-22): the last 7 settled days by page, web and images, summed by
// whether the page is an /en one — so English is seen growing, or not, on its own.
type Side = { clicks: number; impressions: number };
const english = (url: string) => /^https:\/\/[^/]+\/en(\/|$)/.test(url);
async function byLanguage(token: string) {
  const end = new Date(Date.now() - 2 * 86400e3);
  const start = new Date(end.getTime() - 6 * 86400e3);
  const out: Record<SearchType, { ar: Side; en: Side }> = { web: { ar: { clicks: 0, impressions: 0 }, en: { clicks: 0, impressions: 0 } }, image: { ar: { clicks: 0, impressions: 0 }, en: { clicks: 0, impressions: 0 } } };
  for (const type of TYPES) {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: isoDay(start), endDate: isoDay(end), dimensions: ["page"], type, rowLimit: 5000 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`search analytics pages ${type} ${res.status}`);
    for (const r of ((await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number }[] }).rows ?? []) {
      const side = out[type][english(r.keys[0]) ? "en" : "ar"];
      side.clicks += Math.round(r.clicks);
      side.impressions += Math.round(r.impressions);
    }
  }
  return out;
}

export async function seoWeekly(sample: string[]) {
  if (!searchConsoleEnabled()) return null;
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/sitemaps`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  const sitemaps = res.ok ? (((await res.json()) as { sitemap?: SitemapStatus[] }).sitemap ?? []) : [];
  const inspected: Inspection[] = [];
  for (const url of sample) inspected.push(await inspect(token, url)); // one at a time: the API's quota is per minute
  const indexed = inspected.filter((i) => i.verdict === "PASS").length;
  const languages = await byLanguage(token).catch((error) => String((error as Error)?.message ?? error));
  const side = (s: Side) => `${s.impressions} impressions, ${s.clicks} clicks`;
  const report = {
    languages: typeof languages === "string" ? languages : Object.fromEntries(TYPES.map((t) => [t, { ar: side(languages[t].ar), en: side(languages[t].en) }])),
    sitemaps: res.ok
      ? sitemaps.map((s) => ({ path: s.path, read: s.lastDownloaded ?? null, pending: !!s.isPending, errors: Number(s.errors ?? 0), warnings: Number(s.warnings ?? 0), found: (s.contents ?? []).map((c) => `${c.type}:${c.submitted ?? "?"}`).join(" ") }))
      : `sitemaps ${res.status}`,
    sample: `${indexed}/${inspected.length} indexed`,
    // (and when Google took another page as this one's canonical — an /en page folded into the Arabic)
    pages: inspected.map((i) => `${i.verdict === "PASS" ? "✓" : "✗"} ${i.url.replace("https://zawmo.com", "") || "/"} — ${i.coverage || i.verdict}${i.lastCrawl ? ` (fetched ${i.lastCrawl.slice(0, 10)})` : ""}${i.canonical && i.canonical !== i.url ? ` ⚠ Google's canonical: ${i.canonical}` : ""}`),
  };
  const sitemapTrouble = !res.ok || sitemaps.some((s) => Number(s.errors ?? 0) > 0 || Number(s.warnings ?? 0) > 0);
  const inspectTrouble = inspected.some((i) => i.verdict.startsWith("error") || (english(i.url) && i.canonical && i.canonical !== i.url));
  const level = sitemapTrouble || inspectTrouble || indexed * 2 < inspected.length ? "warning" : "info";
  console.log("seo weekly", JSON.stringify(report));
  const en = typeof languages === "string" ? "" : `, English ${languages.web.en.impressions + languages.image.en.impressions} impressions / ${languages.web.en.clicks + languages.image.en.clicks} clicks`;
  Sentry.captureMessage(`SEO weekly: ${report.sample}${en}${sitemapTrouble ? ", sitemap has errors" : ""}`, { level, fingerprint: ["seo-weekly", level], extra: report });
  return report;
}
