import type { User } from "@/generated/prisma/client";
import { normalizeTag } from "@/lib/hashtags";
import { db } from "@/lib/db";
import { notify } from "@/server/notifications";
import { systemUser } from "@/server/daily";

// «خطة زاومو الذهبية (تحت الأضواء)» — phase 0 and 1 (his decisions, 2026-11-10):
// points are EARNED by giving Zawmo real things, never bought, and SPENT on a shot pinned under the
// home page's wheel for 24 hours. Every point is a line in PointEntry (who, why, for which thing), so
// a balance is a sum, nothing is counted twice, and the team can see why anyone has what they have.
//
// Earning (his numbers): a shot that went up and passed the check 10 — the more someone shares the
// more they earn, with a smart taper so a flood doesn't pay (the week's first 10 shots full, the next
// 10 half, then a quarter); a heart from a real member (not their own, not a guest) 2, up to 20 a
// shot; a shot that answers the week's Google mission 20 more. Near-duplicates never get here: the
// fingerprint stops them before they go up (src/lib/dhash.ts).
// Spending: 500 = a shot of one's own pinned for 24 h (one pin at a time; the next waits its turn).
// The week's photographer (Friday, by the week's points, at least 5 shots) pins one for free.

export const SHOT_POINTS = 10;
export const LIKE_POINTS = 2;
export const LIKES_CAP = 20;
export const MISSION_POINTS = 20;
export const PIN_COST = 500;
export const PIN_HOURS = 24;
export const WINNER_MIN_SHOTS = 5;
export const WINNER_PICK_HOURS = 12;
const WEEK_MS = 7 * 24 * 3600e3;

// The week's first 10 shots full, the next 10 half, then a quarter.
export const taper = (nth: number) => (nth <= 10 ? SHOT_POINTS : nth <= 20 ? Math.round(SHOT_POINTS / 2) : Math.max(1, Math.round(SHOT_POINTS / 4)));

// Mecca time (as the rest of Zawmo's days): "2026-11-13".
export const dayOf = (at: Date) => new Date(at.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

// Who can earn: real people (not Zawmo's own account).
const earner = { isSystem: false };

export async function balanceOf(userId: string) {
  return (await db.pointEntry.aggregate({ where: { userId }, _sum: { points: true } }))._sum.points ?? 0;
}

export async function weekPointsOf(userId: string, now = new Date()) {
  return (await db.pointEntry.aggregate({ where: { userId, points: { gt: 0 }, createdAt: { gte: new Date(now.getTime() - WEEK_MS) } }, _sum: { points: true } }))._sum.points ?? 0;
}

// Shots that went up and passed the check in the last 8 days, not yet counted.
export async function awardShots(now = new Date()) {
  const shots = await db.angle.findMany({
    where: { status: "READY", screening: "allowed", uploadedAt: { gte: new Date(now.getTime() - 8 * 24 * 3600e3) }, contributor: earner },
    select: { id: true, contributorId: true, uploadedAt: true },
    orderBy: { uploadedAt: "asc" },
    take: 500,
  });
  if (!shots.length) return 0;
  const done = new Set((await db.pointEntry.findMany({ where: { kind: "shot", ref: { in: shots.map((s) => s.id) } }, select: { ref: true } })).map((e) => e.ref));
  let given = 0;
  for (const s of shots) {
    if (done.has(s.id)) continue;
    const before = await db.pointEntry.count({ where: { userId: s.contributorId, kind: "shot", createdAt: { gte: new Date(now.getTime() - WEEK_MS) } } });
    const made = await db.pointEntry.createMany({ data: [{ userId: s.contributorId, kind: "shot", points: taper(before + 1), ref: s.id }], skipDuplicates: true });
    given += made.count;
  }
  return given;
}

// Hearts from real members (not the shot's own, not guests) on shots of the last 30 days.
export async function awardLikes(now = new Date()) {
  const rows = await db.reaction.groupBy({
    by: ["angleId"],
    where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 3600e3) }, user: { isGuest: false, isSystem: false }, angle: { status: "READY", contributor: earner } },
    _count: { _all: true },
  });
  let changed = 0;
  for (const r of rows) {
    const shot = await db.angle.findUnique({ where: { id: r.angleId }, select: { contributorId: true } });
    if (!shot) continue;
    const real = await db.reaction.count({ where: { angleId: r.angleId, userId: { not: shot.contributorId }, user: { isGuest: false, isSystem: false } } });
    const points = Math.min(LIKES_CAP, real * LIKE_POINTS);
    if (!points) continue;
    const had = await db.pointEntry.findUnique({ where: { userId_kind_ref: { userId: shot.contributorId, kind: "likes", ref: r.angleId } }, select: { points: true } });
    if (had && had.points >= points) continue; // never taken back
    await db.pointEntry.upsert({
      where: { userId_kind_ref: { userId: shot.contributorId, kind: "likes", ref: r.angleId } },
      create: { userId: shot.contributorId, kind: "likes", points, ref: r.angleId },
      update: { points },
    });
    changed++;
  }
  return changed;
}

// ── «📸 مهمة الأسبوع» ────────────────────────────────────────────────────────────────────────────
// Each Monday, from what people searched in Google to find Zawmo (SearchTerm, saved that morning):
// three searches with real demand and few photos on Zawmo yet. A shot whose words (Gemini's line,
// its hashtags) carry the search's words answers it.

// Words that say nothing about what is in the picture.
const FILLER = new Set(["صور", "صورة", "صوره", "حقيقية", "حقيقي", "حقيقيه", "جميلة", "جميل", "رائعة", "خلفيات", "خلفية", "في", "من", "على", "مع", "و", "ال", "hd", "photos", "photo", "pictures", "real", "zawmo", "زاومو"]);

export const missionWords = (query: string) =>
  normalizeTag(query)
    .split(/[\s_]+/)
    .map((w: string) => w.replace(/^ال(?=..)/, ""))
    .filter((w: string) => w.length >= 2 && !FILLER.has(w));

// Gemini's line about the shot, with its hashtags (what the picture shows, in words).
const textOf = (s: { aiText: string | null }) => normalizeTag(s.aiText ?? "").replace(/[#_]/g, " ");

export const answers = (text: string, words: string[]) => words.length > 0 && words.every((w) => text.includes(w));

export const mondayOf = (now: Date) => {
  const d = new Date(now.getTime() + 3 * 3600e3);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 24 * 3600e3).toISOString().slice(0, 10);
};

export async function makeMission(now = new Date()) {
  const week = mondayOf(now);
  if (await db.weeklyMission.findUnique({ where: { week } })) return null;
  const day = (await db.searchTerm.findFirst({ orderBy: { day: "desc" }, select: { day: true } }))?.day;
  if (!day) return null;
  const terms = await db.searchTerm.findMany({ where: { day }, orderBy: { impressions: "desc" }, take: 80 });
  const shots = await db.angle.findMany({ where: { status: "READY", screening: "allowed", moment: { visibility: "PUBLIC" } }, select: { aiText: true }, take: 4000 });
  const texts = shots.map(textOf);
  const picked: { query: string; words: string[]; have: number }[] = [];
  const seenWords = new Set<string>();
  for (const t of terms) {
    const words = missionWords(t.query);
    const key = [...words].sort().join(" ");
    if (!words.length || words.length > 3 || seenWords.has(key) || t.impressions < 10) continue;
    const have = texts.filter((x) => answers(x, words)).length;
    if (have >= 25) continue; // already plenty of these
    seenWords.add(key);
    picked.push({ query: t.query, words, have });
    if (picked.length === 3) break;
  }
  if (!picked.length) return null;
  return db.weeklyMission.create({ data: { week, topics: picked } });
}

export async function currentMission(now = new Date()) {
  const m = await db.weeklyMission.findUnique({ where: { week: mondayOf(now) } });
  return m ? { week: m.week, topics: m.topics as { query: string; words: string[]; have: number }[] } : null;
}

export async function awardMission(now = new Date()) {
  const mission = await currentMission(now);
  if (!mission) return 0;
  const start = new Date(`${mission.week}T00:00:00+03:00`);
  const shots = await db.angle.findMany({
    where: { status: "READY", screening: "allowed", uploadedAt: { gte: start }, contributor: earner },
    select: { id: true, contributorId: true, aiText: true },
  });
  let given = 0;
  for (const s of shots) {
    const text = textOf(s);
    if (!mission.topics.some((t) => answers(text, t.words))) continue;
    given += (await db.pointEntry.createMany({ data: [{ userId: s.contributorId, kind: "mission", points: MISSION_POINTS, ref: s.id }], skipDuplicates: true })).count;
  }
  return given;
}

// ── 📌 The pin under the home page's wheel ───────────────────────────────────────────────────────

export class PinError extends Error {
  constructor(public code: "not_found" | "not_public" | "not_enough") {
    super(code);
  }
}

// A shot that may be pinned: the person's own, up and checked, in a public moment.
async function pinnable(userId: string, angleId: string) {
  const shot = await db.angle.findUnique({ where: { id: angleId }, select: { id: true, contributorId: true, status: true, screening: true, moment: { select: { visibility: true, status: true } } } });
  if (!shot || shot.contributorId !== userId) throw new PinError("not_found");
  if (shot.status !== "READY" || shot.screening !== "allowed" || shot.moment.visibility !== "PUBLIC" || shot.moment.status !== "ACTIVE") throw new PinError("not_public");
  return shot;
}

// Its turn: right away if nothing is pinned, else when the last one in the queue ends.
async function nextSlot(now: Date) {
  const last = await db.homePin.findFirst({ where: { endsAt: { gt: now } }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
  const startsAt = last ? last.endsAt : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + PIN_HOURS * 3600e3) };
}

export async function pinWithPoints(user: User, angleId: string, now = new Date()) {
  await pinnable(user.id, angleId);
  return db.$transaction(async (tx) => {
    const balance = (await tx.pointEntry.aggregate({ where: { userId: user.id }, _sum: { points: true } }))._sum.points ?? 0;
    if (balance < PIN_COST) throw new PinError("not_enough");
    const last = await tx.homePin.findFirst({ where: { endsAt: { gt: now } }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
    const startsAt = last ? last.endsAt : now;
    const pin = await tx.homePin.create({ data: { angleId, userId: user.id, source: "points", startsAt, endsAt: new Date(startsAt.getTime() + PIN_HOURS * 3600e3) } });
    await tx.pointEntry.create({ data: { userId: user.id, kind: "pin", points: -PIN_COST, ref: pin.id } });
    return pin;
  });
}

// The week's photographer picks (or is picked for, after 12 h) the free pin.
export async function pinForWinner(userId: string, week: string, angleId: string, now = new Date()) {
  const win = await db.weeklyWinner.findUnique({ where: { week } });
  if (!win || win.userId !== userId || win.pinId) throw new PinError("not_found");
  await pinnable(userId, angleId);
  const slot = await nextSlot(now);
  const pin = await db.homePin.create({ data: { angleId, userId, source: "winner", ...slot } });
  await db.weeklyWinner.update({ where: { week }, data: { pinId: pin.id } });
  return pin;
}

export async function currentPin(now = new Date()) {
  return db.homePin.findFirst({
    where: { startsAt: { lte: now }, endsAt: { gt: now }, angle: { status: "READY", moment: { visibility: "PUBLIC", status: "ACTIVE" } } },
    orderBy: { startsAt: "asc" },
    include: { angle: { select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, filter: true, moment: { select: { code: true, title: true } }, contributor: { select: { displayName: true } } } } },
  });
}

// ── 🏆 The week's photographer (Friday) ───────────────────────────────────────────────────────────

export async function pickWinner(now = new Date()) {
  const week = dayOf(now);
  if (await db.weeklyWinner.findUnique({ where: { week } })) return null;
  const since = new Date(now.getTime() - WEEK_MS);
  const sums = await db.pointEntry.groupBy({ by: ["userId"], where: { points: { gt: 0 }, createdAt: { gte: since }, kind: { in: ["shot", "likes", "mission"] } }, _sum: { points: true }, orderBy: { _sum: { points: "desc" } }, take: 20 });
  for (const s of sums) {
    const user = await db.user.findUnique({ where: { id: s.userId }, select: { isGuest: true, isSystem: true } });
    if (!user || user.isGuest || user.isSystem) continue;
    const shots = await db.pointEntry.count({ where: { userId: s.userId, kind: "shot", createdAt: { gte: since } } });
    if (shots < WINNER_MIN_SHOTS) continue;
    const win = await db.weeklyWinner.create({ data: { week, userId: s.userId, points: s._sum.points ?? 0 } });
    const zawmo = await systemUser();
    await notify({ userId: s.userId, actorId: zawmo.id, kind: "WEEKLY_WINNER", count: win.points }, { key: `winner:${week}`, where: { userId: s.userId, kind: "WEEKLY_WINNER", createdAt: { gte: since } } });
    return win;
  }
  return null;
}

// After 12 hours without a pick: their most liked public shot of the week is pinned for them.
export async function autoPickForWinners(now = new Date()) {
  const late = await db.weeklyWinner.findMany({ where: { pinId: null, createdAt: { lt: new Date(now.getTime() - WINNER_PICK_HOURS * 3600e3) } } });
  let pinned = 0;
  for (const w of late) {
    const since = new Date(w.createdAt.getTime() - WEEK_MS);
    const shots = await db.angle.findMany({
      where: { contributorId: w.userId, status: "READY", screening: "allowed", uploadedAt: { gte: since }, moment: { visibility: "PUBLIC", status: "ACTIVE" } },
      select: { id: true, _count: { select: { reactions: true } } },
    });
    const best = shots.sort((a, b) => b._count.reactions - a._count.reactions)[0];
    if (!best) {
      await db.weeklyWinner.update({ where: { week: w.week }, data: { pinId: "-" } }); // nothing public to pin
      continue;
    }
    await pinForWinner(w.userId, w.week, best.id, now).then(() => pinned++, () => {});
  }
  return pinned;
}

// «📌 صورتك مثبّتة هلّق»: told once, when its turn comes.
export async function tellLivePins(now = new Date()) {
  const live = await db.homePin.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, select: { id: true, userId: true, angleId: true } });
  if (!live.length) return 0;
  const zawmo = await systemUser();
  for (const p of live) {
    await notify({ userId: p.userId, actorId: zawmo.id, kind: "PIN_LIVE", angleId: p.angleId }, { key: `pin-live:${p.id}`, where: { userId: p.userId, kind: "PIN_LIVE", angleId: p.angleId, createdAt: { gte: new Date(now.getTime() - PIN_HOURS * 3600e3) } } });
  }
  return live.length;
}

// ── 👀 Milestones: «لقطتك وصلت 100 مشاهدة!» ──────────────────────────────────────────────────────
// Once per step and shot, at most two a week for a person, never in the quiet hours (22:00–09:00
// Mecca), and never for someone who turned these notes off.
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
export const MILESTONES_PER_WEEK = 2;
export const quietNow = (now: Date) => {
  const h = new Date(now.getTime() + 3 * 3600e3).getUTCHours();
  return h >= 22 || h < 9;
};

export async function tellMilestones(now = new Date()) {
  if (quietNow(now)) return 0;
  const views = await db.angleView.groupBy({ by: ["angleId"], where: { angle: { status: "READY", contributor: { ...earner, notifyGolden: true } } }, _count: { _all: true }, having: { angleId: { _count: { gte: MILESTONES[0] } } } });
  if (!views.length) return 0;
  const zawmo = await systemUser();
  let told = 0;
  for (const v of views) {
    const step = [...MILESTONES].reverse().find((m) => v._count._all >= m);
    if (!step) continue;
    const shot = await db.angle.findUnique({ where: { id: v.angleId }, select: { contributorId: true } });
    if (!shot) continue;
    const already = await db.notification.count({ where: { userId: shot.contributorId, kind: "MILESTONE", angleId: v.angleId, count: { gte: step } } });
    if (already) continue;
    const thisWeek = await db.notification.count({ where: { userId: shot.contributorId, kind: "MILESTONE", createdAt: { gte: new Date(now.getTime() - WEEK_MS) } } });
    if (thisWeek >= MILESTONES_PER_WEEK) continue;
    await notify({ userId: shot.contributorId, actorId: zawmo.id, kind: "MILESTONE", angleId: v.angleId, count: step }, { key: `milestone:${v.angleId}:${step}`, where: { userId: shot.contributorId, kind: "MILESTONE", angleId: v.angleId, count: { gte: step } } });
    told++;
  }
  return told;
}

// The hourly run (cleanup cron): points first, then what people are told.
export async function goldenHourly(now = new Date()) {
  const safe = <T,>(name: string, p: Promise<T>) => p.catch((error) => (console.error(`golden ${name} failed`, error), -1 as const));
  return {
    shots: await safe("shots", awardShots(now)),
    likes: await safe("likes", awardLikes(now)),
    mission: await safe("mission", awardMission(now)),
    autoPinned: await safe("autopick", autoPickForWinners(now)),
    pinsLive: quietNow(now) ? 0 : await safe("pins", tellLivePins(now)),
    milestones: await safe("milestones", tellMilestones(now)),
  };
}

// What a person sees of their own points (/points).
export async function myPoints(user: User, now = new Date()) {
  const [balance, week, entries, mission, pins, win] = await Promise.all([
    balanceOf(user.id),
    weekPointsOf(user.id, now),
    db.pointEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    currentMission(now),
    db.homePin.findMany({ where: { userId: user.id, endsAt: { gt: now } }, orderBy: { startsAt: "asc" } }),
    db.weeklyWinner.findFirst({ where: { userId: user.id, pinId: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return { balance, week, entries, mission, pins, freePin: win ? win.week : null };
}
