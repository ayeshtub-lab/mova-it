import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assertAdmin } from "@/server/moderation";

// The admin dashboard: who opened Zawmo each day, who joined, what they made, and the
// number the closed beta is judged by — how many come back the next day (target 20%).
// Days are Mecca calendar days (UTC+3); activity is recorded once per person per day.

const MECCA_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const TARGET_RETURN = 0.2;

export const activityDay = (at = new Date()) => new Date(at.getTime() + MECCA_MS).toISOString().slice(0, 10);
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - MECCA_MS);

// "This person used Zawmo today" — at most one row per person per day.
export async function recordActivity(user: User, at = new Date()) {
  if (user.isSystem) return;
  await db.activeDay.createMany({ data: [{ userId: user.id, day: activityDay(at) }], skipDuplicates: true });
}

// Of the people who joined on `day`, the share active `after` days later (null: nobody joined).
async function returnRate(day: string, after: number) {
  const joined = await db.user.findMany({
    where: { isSystem: false, createdAt: { gte: dayStart(day), lt: dayStart(shift(day, 1)) } },
    select: { id: true },
  });
  if (!joined.length) return { joined: 0, returned: 0, rate: null as number | null };
  const returned = await db.activeDay.count({ where: { day: shift(day, after), userId: { in: joined.map((u) => u.id) } } });
  return { joined: joined.length, returned, rate: returned / joined.length };
}

export async function getStats(viewer: User | null, now = new Date(), days = 14) {
  assertAdmin(viewer);
  const today = activityDay(now);
  const first = shift(today, -(days - 1));
  const since = dayStart(first);
  const weekAgo = dayStart(shift(today, -6));

  const [active, users, angles, moments, reactionsToday, commentsToday, weekAngles] = await Promise.all([
    db.activeDay.groupBy({ by: ["day"], where: { day: { gte: first } }, _count: { _all: true } }),
    db.user.findMany({ where: { isSystem: false, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.angle.findMany({ where: { uploadedAt: { gte: since } }, select: { uploadedAt: true } }),
    db.moment.findMany({ where: { createdAt: { gte: since }, kind: { not: "DAILY" } }, select: { createdAt: true } }),
    db.reaction.count({ where: { createdAt: { gte: dayStart(today) } } }),
    db.comment.count({ where: { createdAt: { gte: dayStart(today) } } }),
    db.angle.groupBy({ by: ["momentId"], where: { uploadedAt: { gte: weekAgo } }, _count: { _all: true }, orderBy: { _count: { momentId: "desc" } }, take: 5 }),
  ]);

  const count = (dates: Date[]) => {
    const m = new Map<string, number>();
    for (const d of dates) m.set(activityDay(d), (m.get(activityDay(d)) ?? 0) + 1);
    return m;
  };
  const activeBy = new Map(active.map((a) => [a.day, a._count._all]));
  const newBy = count(users.map((u) => u.createdAt));
  const shotsBy = count(angles.map((a) => a.uploadedAt));
  const momentsBy = count(moments.map((m) => m.createdAt));
  const series = Array.from({ length: days }, (_, i) => {
    const day = shift(first, i);
    return { day, active: activeBy.get(day) ?? 0, joined: newBy.get(day) ?? 0, shots: shotsBy.get(day) ?? 0 };
  });

  // Next-day return: yesterday's newcomers seen today (today is still running), and the
  // average over the last 7 finished cohorts. Week return: newcomers of 7 days ago seen today.
  const cohorts = await Promise.all(Array.from({ length: 7 }, (_, i) => returnRate(shift(today, -2 - i), 1)));
  const joinedSum = cohorts.reduce((s, c) => s + c.joined, 0);
  const [yesterday, week] = await Promise.all([returnRate(shift(today, -1), 1), returnRate(shift(today, -7), 7)]);

  const top = await db.moment.findMany({ where: { id: { in: weekAngles.map((w) => w.momentId) } }, select: { id: true, code: true, title: true } });
  return {
    today,
    totals: {
      active: activeBy.get(today) ?? 0,
      joined: newBy.get(today) ?? 0,
      shots: shotsBy.get(today) ?? 0,
      moments: momentsBy.get(today) ?? 0,
      reactions: reactionsToday,
      comments: commentsToday,
    },
    returns: {
      yesterday,
      average: { joined: joinedSum, returned: cohorts.reduce((s, c) => s + c.returned, 0), rate: joinedSum ? cohorts.reduce((s, c) => s + c.returned, 0) / joinedSum : null },
      week,
    },
    series,
    topMoments: weekAngles.map((w) => ({ ...top.find((m) => m.id === w.momentId)!, shots: w._count._all })).filter((m) => m.code),
  };
}
