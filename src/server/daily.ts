import type { User } from "@/generated/prisma/client";
import { DAILY_THEMES, themeByKey } from "@/lib/dailyThemes";
import { db } from "@/lib/db";
import { viewUrl } from "@/server/media";
import { assertAdmin } from "@/server/moderation";
import { createDailyMoment } from "@/server/moments";

// «لحظة اليوم»: one public moment a day, theme from the curated list. A day runs
// 06:00 → 06:00 Mecca time (UTC+3), i.e. it starts at 03:00 UTC, so a dawn prayer or
// a late night still belongs to the same day. The moment is created by whoever opens
// the site first that day — no cron needed.

const DAY_START_UTC_HOURS = 3;
const OPTIONS = 3;
const NO_REPEAT_DAYS = 10;

export class DailyError extends Error {
  constructor(public code: "invalid") {
    super(code);
  }
}

// "2026-09-25" for the day that is running at `now`.
export function dayKey(now = new Date()) {
  return new Date(now.getTime() - DAY_START_UTC_HOURS * 3600e3).toISOString().slice(0, 10);
}
export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
}
// When the given day ends (the next day starts).
export const dayEnd = (day: string) => new Date(Date.parse(`${addDays(day, 1)}T00:00:00Z`) + DAY_START_UTC_HOURS * 3600e3);
// Whole hours left in the day (at least 1), for "ends in N hours".
export const hoursLeft = (day: string, now = new Date()) => Math.max(1, Math.round((dayEnd(day).getTime() - now.getTime()) / 3600e3));

// Small seeded PRNG so a day's three options are the same for everyone, every time.
function seeded(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Every theme people may vote for on `day` (none used in the last 10 days), in a
// seeded order that's the same for everyone; the first three are the featured ones.
export async function candidatesFor(day: string) {
  const recent = await db.dailyPlan.findMany({
    where: { day: { gte: addDays(day, -NO_REPEAT_DAYS), lt: day } },
    select: { themeKey: true },
  });
  const used = new Set(recent.map((p) => p.themeKey));
  const pool = DAILY_THEMES.filter((t) => !used.has(t.key));
  const list = (pool.length >= OPTIONS ? pool : DAILY_THEMES).slice();
  const rand = seeded(day);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// The three featured themes for `day`.
export async function optionsFor(day: string) {
  return (await candidatesFor(day)).slice(0, OPTIONS);
}

async function tally(day: string) {
  const groups = await db.dailyVote.groupBy({ by: ["themeKey"], where: { day }, _count: { _all: true } });
  return new Map(groups.map((g) => [g.themeKey, g._count._all]));
}

// Most votes wins (any candidate); ties go to the earlier one — so with no votes, the
// first featured theme.
async function winner(day: string) {
  const [candidates, votes] = await Promise.all([candidatesFor(day), tally(day)]);
  let best = candidates[0];
  for (const t of candidates) if ((votes.get(t.key) ?? 0) > (votes.get(best.key) ?? 0)) best = t;
  return { theme: best, source: (votes.get(best.key) ?? 0) > 0 ? "vote" : "random" };
}

async function systemUser() {
  return (
    (await db.user.findFirst({ where: { isSystem: true } })) ??
    db.user.create({ data: { displayName: "زاومو", isGuest: false, isSystem: true } })
  );
}

// Today's plan with its moment, creating both on the first visit of the day. Safe
// under concurrent first visits: only one moment gets attached to the day.
export async function today(now = new Date()) {
  const day = dayKey(now);
  const existing = await db.dailyPlan.findUnique({ where: { day }, include: { moment: true } });
  if (existing?.moment) return { day, plan: existing, moment: existing.moment, theme: themeByKey(existing.themeKey) };

  if (!existing) {
    const { theme, source } = await winner(day);
    await db.dailyPlan.create({ data: { day, themeKey: theme.key, source } }).catch(() => {}); // lost the race: fine
  }
  const plan = await db.dailyPlan.findUniqueOrThrow({ where: { day } });
  const theme = themeByKey(plan.themeKey);
  const moment = await createDailyMoment(await systemUser(), `${theme.emoji} ${theme.ar}`);
  const attached = await db.dailyPlan.updateMany({ where: { day, momentId: null }, data: { momentId: moment.id } });
  if (attached.count === 0) await db.moment.delete({ where: { id: moment.id } }); // someone else attached first
  const final = await db.dailyPlan.findUniqueOrThrow({ where: { day }, include: { moment: true } });
  return { day, plan: final, moment: final.moment!, theme: themeByKey(final.themeKey) };
}

// Voting for tomorrow's theme: the three options, the counts, and the viewer's vote.
export async function tomorrowVote(viewer: User | null, now = new Date()) {
  const day = addDays(dayKey(now), 1);
  const [candidates, votes, mine, preset] = await Promise.all([
    candidatesFor(day),
    tally(day),
    viewer ? db.dailyVote.findUnique({ where: { day_userId: { day, userId: viewer.id } } }) : null,
    db.dailyPlan.findUnique({ where: { day } }),
  ]);
  return {
    day,
    // An admin already set tomorrow's theme: no vote.
    decided: preset ? themeByKey(preset.themeKey) : null,
    // The three featured themes, then all the others one can pick from.
    options: candidates.slice(0, OPTIONS).map((t) => ({ ...t, votes: votes.get(t.key) ?? 0 })),
    more: candidates.slice(OPTIONS).map((t) => ({ ...t, votes: votes.get(t.key) ?? 0 })),
    mine: mine?.themeKey ?? null,
  };
}

export async function vote(user: User, themeKey: unknown, now = new Date()) {
  const day = addDays(dayKey(now), 1);
  const candidates = await candidatesFor(day);
  if (typeof themeKey !== "string" || !candidates.some((t) => t.key === themeKey)) throw new DailyError("invalid");
  await db.dailyVote.upsert({
    where: { day_userId: { day, userId: user.id } },
    create: { day, userId: user.id, themeKey },
    update: { themeKey },
  });
}

// Admin: set the theme of today (renames the running moment) or of a coming day.
export async function setTheme(admin: User, day: string, themeKey: string) {
  assertAdmin(admin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !DAILY_THEMES.some((t) => t.key === themeKey)) throw new DailyError("invalid");
  const theme = themeByKey(themeKey);
  const plan = await db.dailyPlan.upsert({ where: { day }, create: { day, themeKey, source: "admin" }, update: { themeKey, source: "admin" } });
  if (plan.momentId) await db.moment.update({ where: { id: plan.momentId }, data: { title: `${theme.emoji} ${theme.ar}` } });
}

// What the home card needs: today's theme, how many angles, whether the viewer is in,
// a cover (the first angle — visible to everyone even under give-to-get).
export async function todayCard(viewer: User | null) {
  const t = await today();
  const live = { momentId: t.moment.id, status: "READY" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
  const [angleCount, joined, first] = await Promise.all([
    db.angle.count({ where: live }),
    viewer ? db.angle.count({ where: { ...live, contributorId: viewer.id } }).then((n) => n > 0) : false,
    db.angle.findFirst({ where: live, orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], select: { mediaType: true, mediaPath: true, thumbPath: true } }),
  ]);
  return {
    code: t.moment.code,
    theme: t.theme,
    hoursLeft: hoursLeft(t.day),
    angleCount,
    joined,
    coverUrl: first ? await viewUrl(first.mediaType === "VIDEO" ? first.thumbPath : first.mediaPath) : null,
  };
}

// If this moment is a «لحظة اليوم», its day and theme.
export async function dailyFor(momentId: string) {
  const plan = await db.dailyPlan.findUnique({ where: { momentId } });
  return plan ? { day: plan.day, theme: themeByKey(plan.themeKey), hoursLeft: hoursLeft(plan.day), isToday: plan.day === dayKey() } : null;
}
