import { createSign } from "node:crypto";
import { cache } from "react";
import { db } from "@/lib/db";

// What people really type in Google to find Zawmo (Google Search Console, read only): every
// Monday the last 28 days of searches — web and images — are kept (SearchTerm), so that
//  • Gemini, describing a shot, knows the searches that already bring people here and uses
//    one when it truly describes what is seen (src/server/screening.ts);
//  • «🔎 السيو» (/admin/seo) shows the searches with the most impressions and the most clicks,
//    week on week.
// It needs a Google service account with read access to the property: its JSON key, base64,
// in GSC_SERVICE_ACCOUNT. Without it nothing is fetched and nothing breaks.

const PROPERTY = "sc-domain:zawmo.com";
const TYPES = ["web", "image"] as const;
type SearchType = (typeof TYPES)[number];

export const searchConsoleEnabled = () => !!process.env.GSC_SERVICE_ACCOUNT;

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

// A short-lived access token from the service account's key (a signed JWT, as Google asks).
async function accessToken() {
  const key = JSON.parse(Buffer.from(process.env.GSC_SERVICE_ACCOUNT!, "base64").toString("utf8")) as { client_email: string; private_key: string };
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
