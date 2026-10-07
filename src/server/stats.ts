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

// "This person used Zawmo today" — at most one row per person per day. Someone who joined
// before places were kept gets theirs from today's visit (src/lib/geo.ts), once.
export async function recordActivity(user: User, at = new Date(), place?: { country: string | null; city: string | null }) {
  if (user.isSystem) return;
  await db.activeDay.createMany({ data: [{ userId: user.id, day: activityDay(at) }], skipDuplicates: true });
  if (!user.country && place?.country) await db.user.updateMany({ where: { id: user.id, country: null }, data: place });
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

// A new visitor reached the ad landing page from `source` (one count per browser: only when
// it has no source cookie yet, so reloads and returns don't add up).
export async function recordLanding(source: string, at = new Date()) {
  const day = activityDay(at);
  await db.sourceVisit.upsert({ where: { day_source: { day, source } }, create: { day, source, visits: 1 }, update: { visits: { increment: 1 } } });
}

// A step on the ad landing page (src/app/GuestForm.tsx): started typing a name, or pressed
// «ابدأ». Counted per campaign and day, once per browser and step (the page makes sure).
export const FUNNEL_STEPS = ["typed", "tried"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export async function recordFunnel(source: string, step: FunnelStep, at = new Date()) {
  const day = activityDay(at);
  await db.sourceVisit.upsert({ where: { day_source: { day, source } }, create: { day, source, [step]: 1 }, update: { [step]: { increment: 1 } } });
}

// Per campaign / source (User.source, src/lib/source.ts), for people who joined since `since`:
// how many joined, how many published a shot, and how many came back on a later day.
export async function sourceStats(since: Date) {
  const people = await db.user.findMany({ where: { isSystem: false, createdAt: { gte: since } }, select: { id: true, source: true, createdAt: true } });
  const ids = people.map((p) => p.id);
  const [shooters, days] = await Promise.all([
    db.angle.groupBy({ by: ["contributorId"], where: { contributorId: { in: ids }, status: "READY" } }),
    db.activeDay.findMany({ where: { userId: { in: ids } }, select: { userId: true, day: true } }),
  ]);
  const shot = new Set(shooters.map((s) => s.contributorId));
  const joinedDay = new Map(people.map((p) => [p.id, activityDay(p.createdAt)]));
  const cameBack = new Set(days.filter((d) => d.day > joinedDay.get(d.userId)!).map((d) => d.userId));
  const landed = await db.sourceVisit.groupBy({ by: ["source"], where: { day: { gte: activityDay(since) } }, _sum: { visits: true, typed: true, tried: true } });
  const rows = new Map<string, { source: string; landed: number; typed: number; tried: number; joined: number; shot: number; returned: number }>();
  for (const l of landed)
    rows.set(l.source, { source: l.source, landed: l._sum.visits ?? 0, typed: l._sum.typed ?? 0, tried: l._sum.tried ?? 0, joined: 0, shot: 0, returned: 0 });
  for (const p of people) {
    const key = p.source ?? "direct";
    const row = rows.get(key) ?? { source: key, landed: 0, typed: 0, tried: 0, joined: 0, shot: 0, returned: 0 };
    row.joined++;
    if (shot.has(p.id)) row.shot++;
    if (cameBack.has(p.id)) row.returned++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.joined - a.joined || b.landed - a.landed);
}

// Per country (User.country): members in all, and of those who joined since `since`, how many
// joined and how many published a shot — where Zawmo is growing, for per-country plans.
export async function countryStats(since: Date) {
  const [all, recent] = await Promise.all([
    db.user.groupBy({ by: ["country"], where: { isSystem: false }, _count: { _all: true } }),
    db.user.findMany({ where: { isSystem: false, createdAt: { gte: since } }, select: { id: true, country: true } }),
  ]);
  const shooters = await db.angle.groupBy({ by: ["contributorId"], where: { contributorId: { in: recent.map((p) => p.id) }, status: "READY" } });
  const shot = new Set(shooters.map((s) => s.contributorId));
  const rows = new Map<string, { country: string; members: number; joined: number; shot: number }>();
  const row = (key: string | null) => {
    const k = key ?? "??";
    if (!rows.has(k)) rows.set(k, { country: k, members: 0, joined: 0, shot: 0 });
    return rows.get(k)!;
  };
  for (const a of all) row(a.country).members = a._count._all;
  for (const p of recent) {
    const r = row(p.country);
    r.joined++;
    if (shot.has(p.id)) r.shot++;
  }
  return [...rows.values()].sort((a, b) => b.joined - a.joined || b.members - a.members);
}

// The two weekly numbers Zawmo grows by, this week against the one before:
// - strangers: people who added a shot to someone else's moment without knowing them on Zawmo
//   (no invite between them, neither follows the other) — the moment reached past its circle;
// - next-day return: of the week's newcomers, how many were back the day after they joined.
// A week is 7 Mecca days; this week's newest cohort is still being measured (today isn't over).
async function strangers(from: Date, to: Date) {
  const shots = await db.angle.findMany({
    where: { status: "READY", uploadedAt: { gte: from, lt: to }, contributor: { isSystem: false } },
    select: { contributorId: true, moment: { select: { creatorId: true } } },
  });
  const others = shots.filter((s) => s.contributorId !== s.moment.creatorId);
  if (!others.length) return 0;
  const people = [...new Set(others.flatMap((s) => [s.contributorId, s.moment.creatorId]))];
  const [invites, follows] = await Promise.all([
    db.momentInvite.findMany({ where: { fromUserId: { in: people }, toUserId: { in: people } }, select: { fromUserId: true, toUserId: true } }),
    db.follow.findMany({ where: { followerId: { in: people }, followingId: { in: people } }, select: { followerId: true, followingId: true } }),
  ]);
  const pair = (x: string, y: string) => [x, y].sort().join(":");
  const known = new Set([...invites.map((i) => pair(i.fromUserId, i.toUserId)), ...follows.map((f) => pair(f.followerId, f.followingId))]);
  return new Set(others.filter((s) => !known.has(pair(s.contributorId, s.moment.creatorId))).map((s) => s.contributorId)).size;
}

async function weekReturn(lastCohort: string) {
  const cohorts = await Promise.all(Array.from({ length: 7 }, (_, i) => returnRate(shift(lastCohort, -i), 1)));
  const joined = cohorts.reduce((s, c) => s + c.joined, 0);
  const returned = cohorts.reduce((s, c) => s + c.returned, 0);
  return { joined, returned, rate: joined ? returned / joined : null };
}

export async function weeklyNumbers(now = new Date()) {
  const today = activityDay(now);
  const [thisStrangers, lastStrangers, thisReturn, lastReturn] = await Promise.all([
    strangers(dayStart(shift(today, -6)), dayStart(shift(today, 1))),
    strangers(dayStart(shift(today, -13)), dayStart(shift(today, -6))),
    weekReturn(shift(today, -1)),
    weekReturn(shift(today, -8)),
  ]);
  return { strangers: { thisWeek: thisStrangers, lastWeek: lastStrangers }, nextDay: { thisWeek: thisReturn, lastWeek: lastReturn } };
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

  const [sources, countries, weekly] = await Promise.all([sourceStats(since), countryStats(since), weeklyNumbers(now)]);
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
    weekly,
    series,
    sources,
    countries,
    topMoments: weekAngles.map((w) => ({ ...top.find((m) => m.id === w.momentId)!, shots: w._count._all })).filter((m) => m.code),
  };
}
