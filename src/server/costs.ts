import { list } from "@vercel/blob";
import { db } from "@/lib/db";

// «💰 التكاليف» (/admin/costs): what Zawmo costs to run, and per active member — to know
// BEFORE any campaign what each new person costs. Gemini is counted by us on every call (its
// own token counts); Stream and Blob are read from the providers; the fixed plans are listed
// at their known monthly price. Every figure in dollars, an estimate (prices below).

// Prices (USD) — estimates from the providers' public lists; change here if they change.
export const PRICES = {
  geminiInPerM: 0.3, // per 1M input tokens (Gemini Flash class)
  geminiOutPerM: 2.5, // per 1M output tokens
  streamStoredPer1000Min: 5, // per 1,000 minutes stored, monthly
  streamViewedPer1000Min: 1, // per 1,000 minutes delivered
  blobPerGbMonth: 0.023, // Vercel Blob storage
};
// The plans paid every month whatever happens (USD).
export const AUDD_FREE = 300;
export const FIXED_MONTHLY = [
  { name: "Vercel Pro", usd: 20 },
  { name: "Neon Launch", usd: 19 },
  { name: "Cloudflare Stream", usd: 5 },
];

const day = (d: Date) => d.toISOString().slice(0, 10);

// Called after every successful Gemini answer (src/server/screening.ts): adds that call and its
// tokens to today's row for its purpose. Never throws, never waits the caller.
export function recordGemini(purpose: string, res: Response) {
  if (!process.env.DATABASE_URL) return;
  res
    .clone()
    .json()
    .then(async (body: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }) => {
      const u = body?.usageMetadata ?? {};
      const inTokens = u.promptTokenCount ?? 0;
      const outTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
      const service = `gemini:${purpose}`;
      await db.costDay.upsert({
        where: { day_service: { day: day(new Date()), service } },
        create: { day: day(new Date()), service, calls: 1, inTokens, outTokens },
        update: { calls: { increment: 1 }, inTokens: { increment: inTokens }, outTokens: { increment: outTokens } },
      });
    })
    .catch((error) => console.error("cost record failed", purpose, error));
}

// Any other paid call, by count (AudD's fingerprint checks: 300 free, then $5 per 1,000).
export function recordUsage(service: string) {
  if (!process.env.DATABASE_URL) return;
  db.costDay
    .upsert({ where: { day_service: { day: day(new Date()), service } }, create: { day: day(new Date()), service, calls: 1 }, update: { calls: { increment: 1 } } })
    .catch((error) => console.error("cost record failed", service, error));
}

const geminiUsd = (inTokens: number, outTokens: number) => (inTokens / 1e6) * PRICES.geminiInPerM + (outTokens / 1e6) * PRICES.geminiOutPerM;

async function streamUsage() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!account || !token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const storage = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream/storage-usage`, { headers, cache: "no-store" })
    .then((r) => r.json() as Promise<{ result?: { videoCount: number; totalStorageMinutes: number; totalStorageMinutesLimit: number } }>)
    .then((j) => j.result ?? null)
    .catch(() => null);
  // Minutes watched need «Account Analytics: Read» on the token; without it: null.
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400e3);
  const viewed = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      query: "query($a:String!,$s:Date!,$e:Date!){viewer{accounts(filter:{accountTag:$a}){streamMinutesViewedAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{minutesViewed}}}}}",
      variables: { a: account, s: day(start), e: day(end) },
    }),
  })
    .then((r) => r.json() as Promise<{ data?: { viewer: { accounts: { streamMinutesViewedAdaptiveGroups: { sum: { minutesViewed: number } }[] }[] } } }>)
    .then((j) => {
      const groups = j.data?.viewer.accounts[0]?.streamMinutesViewedAdaptiveGroups;
      return groups ? groups.reduce((s, g) => s + g.sum.minutesViewed, 0) : null;
    })
    .catch(() => null);
  return storage ? { videos: storage.videoCount, storedMinutes: storage.totalStorageMinutes, limitMinutes: storage.totalStorageMinutesLimit, viewedMinutes: viewed } : null;
}

async function blobUsage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  let bytes = 0;
  let files = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    for (const b of page.blobs) {
      bytes += b.size;
      files++;
    }
    cursor = page.cursor;
  } while (cursor);
  return { files, gb: bytes / 1e9 };
}

export async function costReport(now = new Date()) {
  const since30 = day(new Date(now.getTime() - 30 * 86400e3));
  const today = day(now);
  const [rows, stream, blob, active] = await Promise.all([
    db.costDay.findMany({ where: { day: { gte: since30 } }, orderBy: { day: "desc" } }),
    streamUsage(),
    blobUsage().catch(() => null),
    db.activeDay.findMany({ where: { day: { gte: since30 } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  const gemini = new Map<string, { calls: number; inTokens: number; outTokens: number }>();
  let geminiToday = 0;
  for (const r of rows) {
    if (!r.service.startsWith("gemini:")) continue;
    const g = gemini.get(r.service) ?? { calls: 0, inTokens: 0, outTokens: 0 };
    gemini.set(r.service, { calls: g.calls + r.calls, inTokens: g.inTokens + r.inTokens, outTokens: g.outTokens + r.outTokens });
    if (r.day === today) geminiToday += geminiUsd(r.inTokens, r.outTokens);
  }
  const geminiRows = [...gemini].map(([service, g]) => ({ service: service.replace("gemini:", ""), ...g, usd: geminiUsd(g.inTokens, g.outTokens) }));
  const geminiMonth = geminiRows.reduce((s, g) => s + g.usd, 0);
  const tracking = rows.length ? rows[rows.length - 1].day : null;
  const streamMonth = stream ? (stream.storedMinutes / 1000) * PRICES.streamStoredPer1000Min + ((stream.viewedMinutes ?? 0) / 1000) * PRICES.streamViewedPer1000Min : 0;
  const blobMonth = blob ? blob.gb * PRICES.blobPerGbMonth : 0;
  // AudD: 300 checks free (ever), then $5 per 1,000.
  const auddEver = (await db.costDay.aggregate({ where: { service: "audd" }, _sum: { calls: true } }))._sum.calls ?? 0;
  const auddMonth = rows.filter((r) => r.service === "audd").reduce((s, r) => s + r.calls, 0);
  const auddUsd = (Math.max(0, auddEver - AUDD_FREE) / 1000) * 5 * (auddEver ? auddMonth / auddEver : 0);
  const fixed = FIXED_MONTHLY.reduce((s, f) => s + f.usd, 0);
  const variable = geminiMonth + streamMonth + blobMonth + auddUsd;
  const activeMembers = active.length;
  return {
    since: tracking,
    gemini: { rows: geminiRows, today: geminiToday, month: geminiMonth },
    stream,
    streamMonth,
    blob,
    blobMonth,
    audd: { ever: auddEver, month: auddMonth, freeLeft: Math.max(0, AUDD_FREE - auddEver), usd: auddUsd },
    fixed,
    variable,
    total: fixed + variable,
    activeMembers,
    perMember: activeMembers ? (fixed + variable) / activeMembers : null,
    variablePerMember: activeMembers ? variable / activeMembers : null,
  };
}
