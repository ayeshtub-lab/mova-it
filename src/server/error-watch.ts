import { db } from "@/lib/db";

// Server errors counted per half hour (2026-11-20): the health guard (/api/cron/health) runs every
// 30 minutes, so a stall that comes and goes between two runs — the 5 minutes of 504s on 10/11 —
// went unseen. Every error a page or API route throws (src/instrumentation.ts onRequestError) adds
// one here; the next run reads this half hour and the one before, and tells the admins.
// Kept in the RateLimit table (no new table), each count for 6 hours. Never more than one write
// at a time from one server: during a database stall, the count must not add to the queue.

const SLOT_MS = 30 * 60_000;
const slotKey = (t: number) => `serverErrors:${Math.floor(t / SLOT_MS)}`;

let pending = 0;
let writing = false;

async function flush() {
  writing = true;
  while (pending) {
    const n = pending;
    pending = 0;
    const key = slotKey(Date.now());
    await db.$executeRaw`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, ${n}, now() + interval '6 hours')
      ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimit"."count" + ${n}`.catch(() => {});
  }
  writing = false;
}

export function countServerError() {
  pending++;
  if (!writing) void flush();
}

// Errors in this half hour and the one before (up to an hour: a run never misses a slot).
export async function recentServerErrors() {
  const now = Date.now();
  const rows = await db.rateLimit.findMany({ where: { key: { in: [slotKey(now), slotKey(now - SLOT_MS)] } }, select: { count: true } });
  return rows.reduce((sum, r) => sum + r.count, 0);
}
