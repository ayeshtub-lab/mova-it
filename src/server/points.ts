import type { User } from "@/generated/prisma/client";
import { normalizeTag } from "@/lib/hashtags";
import { db } from "@/lib/db";
import { notify } from "@/server/notifications";
import { systemUser } from "@/server/daily";

// «خطة زاومو الذهبية» — for members «⭐ تحت أضواء زاومو» (his decisions, 2026-11-10 and 12):
// points are EARNED by giving Zawmo real public pictures, never bought, and SPENT on appearances
// under the home page's wheel: one point, one appearance. Every point is a line in PointEntry (who,
// why, for which thing), so a balance is a sum, nothing is counted twice, and the team can see why
// anyone has what they have.
//
// Earning — only for shots in PUBLIC moments (what Google and visitors can see):
// - a shot that went up and passed the check: 10 (a video 15) — the week's first 10 shots full, the next 10 half,
//   then a quarter, so a flood doesn't pay;
// - a heart from a real member: 2, up to 20 a shot. Not their own, not a guest, an account of 3 days
//   at least, and at most 5 hearts a week from one member to the same person count (friends who
//   heart everything of each other don't make points);
// - a shot that answers the week's Google mission: 20 more.
// A shot deleted or made private within 30 days takes its points back (they return if it is public
// again). Near-duplicates never get here: the fingerprint stops them before they go up.
// Spending: from 100 points, on 1 to 5 public shots — see «تحت أضواء زاومو» below. The week's
// photographer (Friday, by the week's points, at least 5 shots) gets 500 appearances free.

export const SHOT_POINTS = 10;
// A video takes more to shoot and send, and Google Video brings Zawmo the most (his call, 2026-11-12).
export const VIDEO_POINTS = 15;
export const LIKE_POINTS = 2;
export const LIKES_CAP = 20;
export const MISSION_POINTS = 20;
export const HEART_ACCOUNT_DAYS = 3;
export const HEARTS_PER_PAIR_WEEK = 5;
export const UNDO_DAYS = 30;
// The spotlight: one point = one appearance.
export const SPOT_MIN = 100;
export const SPOT_AMOUNTS = [100, 250, 500];
export const SPOT_MAX_SHOTS = 5;
export const SPOT_DAYS = 7;
export const WINNER_BUDGET = 500;
export const SEEN_AGAIN_MIN = 30;
export const SEEN_PER_NET = 10;
// «🎁 هدية زاومو» (his call, 2026-11-12: «الأعضاء اللي إلهم الفضل بنمو زاومو بيستحقوا 200»): once,
// to every real member with 3 public shots or more taken before the launch — given in the hourly
// runs until the day after (a guest who joins by then gets it too), then never again.
// «📤 ادعِ صاحبك» (his call, 2026-11-12): a member's own link (src/lib/source.ts inviteLink) brings
// someone; once that person — signed in with Google (a real account, not a guest a script can make)
// — has 3 public shots that passed the check, the inviter gets 100, once per person, 10 a week at
// most (the rest wait for the next week). The person invited gets the same as everyone (the gift
// before 17/11, then their own shots).
export const INVITE_POINTS = 100;
export const INVITE_MIN_SHOTS = 3;
export const INVITES_PER_WEEK = 10;
// «👤 تابع زاومو» (his call, 2026-11-12): 50 points once for following Zawmo's own account — taken
// back if the follow is dropped, and never paid twice (follow, unfollow, follow again pays once).
export const FOLLOW_POINTS = 50;
export const GIFT_POINTS = 200;
export const GIFT_MIN_SHOTS = 3;
export const GIFT_SHOTS_BEFORE = new Date("2026-11-17T00:00:00+03:00");
export const GIFT_UNTIL = new Date("2026-11-19T00:00:00+03:00");
export const WINNER_MIN_SHOTS = 5;
export const WINNER_PICK_HOURS = 12;
const WEEK_MS = 7 * 24 * 3600e3;

// The week's first 10 shots full, the next 10 half, then a quarter.
// (a video from 15: 15, then 8, then 4)
export const taper = (nth: number, base = SHOT_POINTS) => (nth <= 10 ? base : nth <= 20 ? Math.round(base / 2) : Math.max(1, Math.round(base / 4)));

// Mecca time (as the rest of Zawmo's days): "2026-11-13".
export const dayOf = (at: Date) => new Date(at.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

// Who can earn: real people (not Zawmo's own account).
const earner = { isSystem: false };
// What earns: a shot up, checked, in a public moment.
const publicShot = { status: "READY" as const, screening: "allowed", moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const } };

export async function balanceOf(userId: string) {
  return (await db.pointEntry.aggregate({ where: { userId }, _sum: { points: true } }))._sum.points ?? 0;
}

// What was earned in the last 7 days (spending and refunds aside; points taken back count against).
export async function weekPointsOf(userId: string, now = new Date()) {
  return (await db.pointEntry.aggregate({ where: { userId, kind: { in: EARNED }, createdAt: { gte: new Date(now.getTime() - WEEK_MS) } }, _sum: { points: true } }))._sum.points ?? 0;
}
const EARNED = ["shot", "likes", "mission", "undo"];

// Public shots that went up and passed the check in the last 8 days, not yet counted.
export async function awardShots(now = new Date()) {
  const shots = await db.angle.findMany({
    where: { ...publicShot, uploadedAt: { gte: new Date(now.getTime() - 8 * 24 * 3600e3) }, contributor: earner },
    select: { id: true, contributorId: true, uploadedAt: true, mediaType: true },
    orderBy: { uploadedAt: "asc" },
    take: 500,
  });
  if (!shots.length) return 0;
  const done = new Set((await db.pointEntry.findMany({ where: { kind: "shot", ref: { in: shots.map((s) => s.id) } }, select: { ref: true } })).map((e) => e.ref));
  let given = 0;
  for (const s of shots) {
    if (done.has(s.id)) continue;
    const before = await db.pointEntry.count({ where: { userId: s.contributorId, kind: "shot", createdAt: { gte: new Date(now.getTime() - WEEK_MS) } } });
    const made = await db.pointEntry.createMany({ data: [{ userId: s.contributorId, kind: "shot", points: taper(before + 1, s.mediaType === "VIDEO" ? VIDEO_POINTS : SHOT_POINTS), ref: s.id }], skipDuplicates: true });
    given += made.count;
  }
  return given;
}

// Which hearts count, in time order: a giver's first 5 a week to the same person.
export function countedHearts<T extends { giver: string; owner: string; at: Date }>(hearts: T[]) {
  const sorted = [...hearts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const byPair = new Map<string, number[]>();
  return sorted.filter((h) => {
    const key = `${h.giver}>${h.owner}`;
    const recent = (byPair.get(key) ?? []).filter((t) => t > h.at.getTime() - WEEK_MS);
    if (recent.length >= HEARTS_PER_PAIR_WEEK) return false;
    byPair.set(key, [...recent, h.at.getTime()]);
    return true;
  });
}

// Hearts on public shots that got one in the last 30 days (all their hearts, so a shot's count only
// grows), from members of 3 days or more, never the shot's own, 5 a week from one member to one person.
export async function awardLikes(now = new Date()) {
  const recent = await db.reaction.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - UNDO_DAYS * 24 * 3600e3) }, angle: { ...publicShot, contributor: earner } },
    select: { angleId: true },
    distinct: ["angleId"],
    take: 2000,
  });
  if (!recent.length) return 0;
  const angleIds = recent.map((r) => r.angleId);
  const owners = await db.angle.findMany({ where: { id: { in: angleIds } }, select: { id: true, contributorId: true } });
  const ownerOf = new Map(owners.map((o) => [o.id, o.contributorId]));
  // Every heart these owners got (the weekly limit per member is across all their shots).
  const all = await db.reaction.findMany({
    where: { angle: { contributorId: { in: [...new Set(ownerOf.values())] } }, user: { isGuest: false, isSystem: false, createdAt: { lte: new Date(now.getTime() - HEART_ACCOUNT_DAYS * 24 * 3600e3) } } },
    select: { angleId: true, userId: true, createdAt: true, angle: { select: { contributorId: true } } },
  });
  const hearts = all.filter((r) => r.userId !== r.angle.contributorId).map((r) => ({ angleId: r.angleId, giver: r.userId, owner: r.angle.contributorId, at: r.createdAt }));
  const per = new Map<string, number>();
  for (const h of countedHearts(hearts)) if (ownerOf.has(h.angleId)) per.set(h.angleId, (per.get(h.angleId) ?? 0) + 1);
  let changed = 0;
  for (const [angleId, n] of per) {
    const owner = ownerOf.get(angleId)!;
    const points = Math.min(LIKES_CAP, n * LIKE_POINTS);
    const had = await db.pointEntry.findUnique({ where: { userId_kind_ref: { userId: owner, kind: "likes", ref: angleId } }, select: { points: true } });
    if (had && had.points >= points) continue; // never taken back here (a hidden shot: «undo»)
    await db.pointEntry.upsert({ where: { userId_kind_ref: { userId: owner, kind: "likes", ref: angleId } }, create: { userId: owner, kind: "likes", points, ref: angleId }, update: { points } });
    changed++;
  }
  return changed;
}

// A shot deleted or no longer public within 30 days of its points: they are taken back («undo», one
// line per line it cancels) — and given again if it is public again. (Upload, collect, delete,
// upload again pays nothing.)
export async function undoRemoved(now = new Date()) {
  const lines = await db.pointEntry.findMany({ where: { kind: { in: ["shot", "likes", "mission"] }, createdAt: { gte: new Date(now.getTime() - UNDO_DAYS * 24 * 3600e3) } }, select: { id: true, userId: true, points: true, ref: true } });
  if (!lines.length) return 0;
  const live = new Set((await db.angle.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.ref))] }, ...publicShot }, select: { id: true } })).map((a) => a.id));
  const undone = await db.pointEntry.findMany({ where: { kind: "undo", ref: { in: lines.map((l) => l.id) } }, select: { id: true, ref: true, points: true } });
  const undoOf = new Map(undone.map((u) => [u.ref, u]));
  let changed = 0;
  for (const l of lines) {
    const u = undoOf.get(l.id);
    if (!live.has(l.ref)) {
      if (!u) changed += (await db.pointEntry.createMany({ data: [{ userId: l.userId, kind: "undo", points: -l.points, ref: l.id }], skipDuplicates: true })).count;
      else if (u.points !== -l.points) changed += (await db.pointEntry.updateMany({ where: { id: u.id }, data: { points: -l.points } })).count;
    } else if (u) {
      changed += (await db.pointEntry.deleteMany({ where: { id: u.id } })).count;
    }
  }
  return changed;
}

// (`only`: for the tests, a few people instead of everyone)
export async function giveGift(now = new Date(), only?: string[]) {
  if (now >= GIFT_UNTIL) return 0;
  const rows = await db.angle.groupBy({ by: ["contributorId"], where: { ...publicShot, uploadedAt: { lt: GIFT_SHOTS_BEFORE }, ...(only ? { contributorId: { in: only } } : {}) }, _count: { _all: true } });
  const ids = rows.filter((r) => r._count._all >= GIFT_MIN_SHOTS).map((r) => r.contributorId);
  if (!ids.length) return 0;
  const people = await db.user.findMany({ where: { id: { in: ids }, isGuest: false, isSystem: false, isAdmin: false, pointEntries: { none: { kind: "gift" } } }, select: { id: true } });
  if (!people.length) return 0;
  const zawmo = await systemUser();
  let given = 0;
  for (const p of people) {
    const made = await db.pointEntry.createMany({ data: [{ userId: p.id, kind: "gift", points: GIFT_POINTS, ref: "launch-2026-11" }], skipDuplicates: true });
    if (!made.count) continue;
    given++;
    await notify({ userId: p.id, actorId: zawmo.id, kind: "POINTS_GIFT", count: GIFT_POINTS }, { key: `gift:${p.id}`, where: { userId: p.id, kind: "POINTS_GIFT" } });
  }
  return given;
}

export async function awardFollow(only?: string[]) {
  const zawmo = await officialZawmo();
  const follows = await db.follow.findMany({ where: { followingId: zawmo.id, follower: { isGuest: false, isSystem: false, isAdmin: false }, ...(only ? { followerId: { in: only } } : {}) }, select: { followerId: true } });
  const following = new Set(follows.map((f) => f.followerId));
  // One read for everyone already paid, then a write only for the new ones (not one a follower an hour).
  const lines = await db.pointEntry.findMany({ where: { kind: "follow", ref: "zawmo", ...(only ? { userId: { in: only } } : {}) }, select: { id: true, userId: true, points: true } });
  const paid = new Set(lines.map((l) => l.userId));
  const fresh = [...following].filter((id) => !paid.has(id));
  let changed = fresh.length ? (await db.pointEntry.createMany({ data: fresh.map((userId) => ({ userId, kind: "follow", points: FOLLOW_POINTS, ref: "zawmo" })), skipDuplicates: true })).count : 0;
  // Dropped the follow: the 50 go back (an «unfollow» line, kept apart from the week's earnings), and
  // return if they follow again.
  const undone = new Map((await db.pointEntry.findMany({ where: { kind: "unfollow", ref: { in: lines.map((l) => l.id) } }, select: { id: true, ref: true } })).map((u) => [u.ref, u.id]));
  for (const l of lines) {
    const u = undone.get(l.id);
    if (!following.has(l.userId) && !u) changed += (await db.pointEntry.createMany({ data: [{ userId: l.userId, kind: "unfollow", points: -l.points, ref: l.id }], skipDuplicates: true })).count;
    else if (following.has(l.userId) && u) changed += (await db.pointEntry.deleteMany({ where: { id: u } })).count;
  }
  return changed;
}

export async function awardInvites(now = new Date(), only?: string[]) {
  const joined = await db.user.findMany({
    where: { invitedById: { not: null }, isGuest: false, isSystem: false, createdAt: { gte: new Date(now.getTime() - 90 * 24 * 3600e3) }, ...(only ? { id: { in: only } } : {}) },
    select: { id: true, invitedById: true },
  });
  if (!joined.length) return 0;
  const paid = new Set((await db.pointEntry.findMany({ where: { kind: "invite", ref: { in: joined.map((j) => j.id) } }, select: { ref: true } })).map((e) => e.ref));
  let given = 0;
  for (const j of joined) {
    const inviterId = j.invitedById!;
    if (paid.has(j.id) || inviterId === j.id) continue;
    if ((await db.angle.count({ where: { contributorId: j.id, ...publicShot } })) < INVITE_MIN_SHOTS) continue;
    const inviter = await db.user.findUnique({ where: { id: inviterId }, select: { id: true, isSystem: true, isGuest: true } });
    if (!inviter || inviter.isSystem || inviter.isGuest) continue;
    if ((await db.pointEntry.count({ where: { userId: inviterId, kind: "invite", createdAt: { gte: new Date(now.getTime() - WEEK_MS) } } })) >= INVITES_PER_WEEK) continue;
    const made = await db.pointEntry.createMany({ data: [{ userId: inviterId, kind: "invite", points: INVITE_POINTS, ref: j.id }], skipDuplicates: true });
    if (!made.count) continue;
    given++;
    await notify({ userId: inviterId, actorId: j.id, kind: "INVITE_JOINED", count: INVITE_POINTS }, { key: `invite:${j.id}`, where: { userId: inviterId, actorId: j.id, kind: "INVITE_JOINED" } });
  }
  return given;
}

// For «⭐ نقاطي»: how many joined from the person's link, and how many of them earned them points.
export async function myInvites(userId: string, now = new Date()) {
  const [joined, paid] = await Promise.all([db.user.count({ where: { invitedById: userId, isSystem: false } }), db.pointEntry.count({ where: { userId, kind: "invite" } })]);
  // (while the launch gift is open, the invite says so)
  return { joined, paid, giftOpen: now < GIFT_SHOTS_BEFORE };
}

// The Zawmo account people see and follow: the team's public «زاومو» profile (an admin account), not
// the hidden system account that only signs Zawmo's own notifications (no one can follow it — found
// 12/11: 11 followers on the first, 0 on the second). Falls back to the system account (tests, fresh DB).
export async function officialZawmo() {
  return (
    (await db.user.findFirst({ where: { displayName: "زاومو", isAdmin: true, isSystem: false, isGuest: false }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await systemUser())
  );
}

export const followsZawmo = async (userId: string) => {
  const zawmo = await officialZawmo();
  return { zawmoId: zawmo.id, following: (await db.follow.count({ where: { followerId: userId, followingId: zawmo.id } })) > 0 };
};

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
    where: { ...publicShot, uploadedAt: { gte: start }, contributor: earner },
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

// ── ⭐ «تحت أضواء زاومو»: the spotlight under the home page's wheel ─────────────────────────────────
// (His call, 2026-11-12: «النقطة = ظهور».) Points buy appearances — one point, one time the picture
// is really on someone's screen (src/app/api/pin-seen) — spread over 1 to 5 of one's public shots,
// and shown until they are used up, 7 days at most; what is left then comes back as points. Several
// people at once share the place: each view picks one, the more left to show the likelier. The
// week's photographer gets 500 appearances free.

export class PinError extends Error {
  constructor(public code: "not_found" | "not_public" | "not_enough" | "too_many" | "too_few" | "taken") {
    super(code);
  }
}

// A shot that may be in the spotlight: the person's own, up and checked, in a public moment.
async function pinnable(userId: string, angleId: string) {
  const shot = await db.angle.findUnique({ where: { id: angleId }, select: { id: true, contributorId: true, status: true, screening: true, moment: { select: { visibility: true, status: true } } } });
  if (!shot || shot.contributorId !== userId) throw new PinError("not_found");
  if (shot.status !== "READY" || shot.screening !== "allowed" || shot.moment.visibility !== "PUBLIC" || shot.moment.status !== "ACTIVE") throw new PinError("not_public");
  return shot;
}

// 500 over 3 shots → 167, 167, 166.
export const split = (amount: number, parts: number) => Array.from({ length: parts }, (_, i) => Math.floor(amount / parts) + (i < amount % parts ? 1 : 0));

async function checkShots(userId: string, angleIds: string[]) {
  const ids = [...new Set(angleIds)];
  if (!ids.length) throw new PinError("not_found");
  if (ids.length > SPOT_MAX_SHOTS) throw new PinError("too_many");
  for (const id of ids) await pinnable(userId, id);
  return ids;
}

const spotRows = (userId: string, ids: string[], amount: number, source: string, batch: string, now: Date) =>
  split(amount, ids.length).map((budget, i) => ({ angleId: ids[i], userId, source, batch, budget, startsAt: now, endsAt: new Date(now.getTime() + SPOT_DAYS * 24 * 3600e3) }));

export async function spotlightWithPoints(user: User, angleIds: string[], amount: number, now = new Date()) {
  const ids = await checkShots(user.id, angleIds);
  if (!Number.isInteger(amount) || amount < SPOT_MIN) throw new PinError("too_few");
  const batch = `b${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return db.$transaction(async (tx) => {
    // One spending at a time for a person: two taps at once can't spend the same points twice.
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const balance = (await tx.pointEntry.aggregate({ where: { userId: user.id }, _sum: { points: true } }))._sum.points ?? 0;
    if (balance < amount) throw new PinError("not_enough");
    await tx.homePin.createMany({ data: spotRows(user.id, ids, amount, "points", batch, now) });
    await tx.pointEntry.create({ data: { userId: user.id, kind: "pin", points: -amount, ref: batch } });
    return { batch, amount };
  });
}

// The week's photographer picks (or is picked for, after 12 h) their free appearances.
export async function spotlightForWinner(userId: string, week: string, angleIds: string[], now = new Date()) {
  const win = await db.weeklyWinner.findUnique({ where: { week } });
  if (!win || win.userId !== userId || win.pinId) throw new PinError("not_found");
  const ids = await checkShots(userId, angleIds);
  const batch = `w${week}`;
  return db.$transaction(async (tx) => {
    // (claimed once, even if two taps arrive together)
    const claimed = await tx.weeklyWinner.updateMany({ where: { week, userId, pinId: null }, data: { pinId: batch } });
    if (!claimed.count) throw new PinError("taken");
    await tx.homePin.createMany({ data: spotRows(userId, ids, WINNER_BUDGET, "winner", batch, now) });
    return { batch, amount: WINNER_BUDGET };
  });
}

// What may be shown now: running, not used up, the shot still public.
export async function livePins(now = new Date()) {
  const pins = await db.homePin.findMany({
    where: { closedAt: null, startsAt: { lte: now }, endsAt: { gt: now }, angle: { status: "READY", screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE" } } },
    orderBy: { startsAt: "asc" },
    take: 30,
    include: { angle: { select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, filter: true, moment: { select: { code: true, title: true } }, contributor: { select: { displayName: true } } } } },
  });
  return pins.filter((p) => p.shown < p.budget);
}

// One of them for this view: the more it has left to show, the likelier (all end about together).
export function pickPin<T extends { budget: number; shown: number }>(pins: T[], random = Math.random()) {
  const left = pins.map((p) => Math.max(0, p.budget - p.shown));
  const total = left.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let at = random * total;
  for (let i = 0; i < pins.length; i++) if ((at -= left[i]) < 0) return pins[i];
  return pins[pins.length - 1];
}

// A real view (src/app/api/pin-seen): counted once per device in 30 minutes, never the owner's own,
// never past what was bought, and no more than 10 devices from one network for one pin.
export async function countSeen(pinId: string, device: string, net: string, viewerId: string | null, now = new Date()) {
  const pin = await db.homePin.findUnique({ where: { id: pinId }, select: { userId: true, closedAt: true, endsAt: true, shown: true, budget: true } });
  if (!pin || pin.closedAt || pin.endsAt <= now || pin.shown >= pin.budget) return "over";
  if (viewerId && viewerId === pin.userId) return "own";
  const known = await db.pinSeen.findUnique({ where: { pinId_device: { pinId, device } }, select: { lastAt: true } });
  if (!known && (await db.pinSeen.count({ where: { pinId, net } })) >= SEEN_PER_NET) return "net";
  const rows = await db.$queryRaw<{ fresh: boolean }[]>`
    INSERT INTO "PinSeen" ("pinId", "device", "net") VALUES (${pinId}, ${device}, ${net})
    ON CONFLICT ("pinId", "device") DO UPDATE SET "views" = "PinSeen"."views" + 1, "lastAt" = now()
      WHERE "PinSeen"."lastAt" < now() - make_interval(mins => ${SEEN_AGAIN_MIN})
    RETURNING (xmax = 0) AS "fresh"`;
  if (!rows.length) return "again";
  const fresh = !!rows[0].fresh;
  const counted = await db.$executeRaw`
    UPDATE "HomePin" SET "shown" = "shown" + 1, "reach" = "reach" + ${fresh ? 1 : 0}
    WHERE "id" = ${pinId} AND "shown" < "budget" AND "closedAt" IS NULL`;
  return counted ? "counted" : "over";
}

// The hourly run: a pin used up, past its 7 days, or whose shot was deleted or made private is
// closed; bought appearances not shown come back as points; when a whole purchase is closed, its
// owner hears how it went (never in the quiet hours — then it waits for the morning).
export async function closePins(now = new Date()) {
  const open = await db.homePin.findMany({
    where: { closedAt: null, startsAt: { lte: now } },
    select: { id: true, userId: true, source: true, budget: true, shown: true, endsAt: true, angle: { select: { status: true, screening: true, moment: { select: { visibility: true, status: true } } } } },
  });
  let closed = 0;
  for (const p of open) {
    const gone = !p.angle || p.angle.status !== "READY" || p.angle.screening !== "allowed" || p.angle.moment.visibility !== "PUBLIC" || p.angle.moment.status !== "ACTIVE";
    if (p.shown < p.budget && p.endsAt > now && !gone) continue;
    await db.$transaction(async (tx) => {
      const done = await tx.homePin.updateMany({ where: { id: p.id, closedAt: null }, data: { closedAt: now } });
      if (!done.count) return;
      const left = p.budget - p.shown;
      if (p.source === "points" && left > 0) await tx.pointEntry.createMany({ data: [{ userId: p.userId, kind: "refund", points: left, ref: p.id }], skipDuplicates: true });
      closed++;
    });
  }
  if (quietNow(now)) return closed;
  // Purchases whose pins are all closed in the last 2 days, not told yet.
  const ended = await db.homePin.groupBy({ by: ["batch", "userId"], where: { closedAt: { gte: new Date(now.getTime() - 48 * 3600e3) }, batch: { not: null } }, _sum: { shown: true }, _min: { createdAt: true } });
  if (!ended.length) return closed;
  const zawmo = await systemUser();
  for (const b of ended) {
    if (await db.homePin.count({ where: { batch: b.batch, closedAt: null } })) continue;
    const first = await db.homePin.findFirst({ where: { batch: b.batch }, orderBy: { createdAt: "asc" }, select: { angleId: true } });
    await notify(
      { userId: b.userId, actorId: zawmo.id, kind: "PIN_DONE", angleId: first?.angleId ?? undefined, count: b._sum.shown ?? 0 },
      { key: `pin-done:${b.batch}`, where: { userId: b.userId, kind: "PIN_DONE", createdAt: { gte: b._min.createdAt ?? now } } },
    );
  }
  return closed;
}

// ── 🏆 The week's photographer (Friday) ───────────────────────────────────────────────────────────
// The most points earned in the 7 days (points taken back count against), with 5 public shots at
// least; never a guest, Zawmo's own account or the team's.

export async function pickWinner(now = new Date()) {
  const week = dayOf(now);
  if (await db.weeklyWinner.findUnique({ where: { week } })) return null;
  const since = new Date(now.getTime() - WEEK_MS);
  const sums = await db.pointEntry.groupBy({ by: ["userId"], where: { createdAt: { gte: since }, kind: { in: EARNED } }, _sum: { points: true }, orderBy: { _sum: { points: "desc" } }, take: 20 });
  for (const s of sums) {
    if ((s._sum.points ?? 0) <= 0) break;
    const user = await db.user.findUnique({ where: { id: s.userId }, select: { isGuest: true, isSystem: true, isAdmin: true } });
    if (!user || user.isGuest || user.isSystem || user.isAdmin) continue;
    const shots = await db.angle.count({ where: { contributorId: s.userId, ...publicShot, uploadedAt: { gte: since } } });
    if (shots < WINNER_MIN_SHOTS) continue;
    const win = await db.weeklyWinner.create({ data: { week, userId: s.userId, points: s._sum.points ?? 0 } });
    const zawmo = await systemUser();
    await notify({ userId: s.userId, actorId: zawmo.id, kind: "WEEKLY_WINNER", count: win.points }, { key: `winner:${week}`, where: { userId: s.userId, kind: "WEEKLY_WINNER", createdAt: { gte: since } } });
    return win;
  }
  return null;
}

// After 12 hours without a pick: their most liked public shot of the week gets the 500 appearances,
// and they are told («⭐ صورتك تحت أضواء زاومو هلّق»).
export async function autoPickForWinners(now = new Date()) {
  const late = await db.weeklyWinner.findMany({ where: { pinId: null, createdAt: { lt: new Date(now.getTime() - WINNER_PICK_HOURS * 3600e3) } } });
  let pinned = 0;
  for (const w of late) {
    const since = new Date(w.createdAt.getTime() - WEEK_MS);
    const shots = await db.angle.findMany({ where: { contributorId: w.userId, ...publicShot, uploadedAt: { gte: since } }, select: { id: true, _count: { select: { reactions: true } } } });
    const best = shots.sort((a, b) => b._count.reactions - a._count.reactions)[0];
    if (!best) {
      await db.weeklyWinner.updateMany({ where: { week: w.week, pinId: null }, data: { pinId: "-" } }); // nothing public to show
      continue;
    }
    const done = await spotlightForWinner(w.userId, w.week, [best.id], now).catch(() => null);
    if (!done) continue;
    pinned++;
    const zawmo = await systemUser();
    await notify({ userId: w.userId, actorId: zawmo.id, kind: "PIN_LIVE", angleId: best.id }, { key: `pin-live:${w.week}`, where: { userId: w.userId, kind: "PIN_LIVE", angleId: best.id } });
  }
  return pinned;
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

// The hourly run (cleanup cron): points first (and taken back), then the spotlight, then what
// people are told — nothing told in the quiet hours (it waits for the morning run).
export async function goldenHourly(now = new Date()) {
  const safe = <T,>(name: string, p: Promise<T>) => p.catch((error) => (console.error(`golden ${name} failed`, error), -1 as const));
  const quiet = quietNow(now);
  return {
    shots: await safe("shots", awardShots(now)),
    likes: await safe("likes", awardLikes(now)),
    mission: await safe("mission", awardMission(now)),
    undone: await safe("undo", undoRemoved(now)),
    follow: await safe("follow", awardFollow()),
    invites: quiet ? 0 : await safe("invites", awardInvites(now)),
    pinsClosed: await safe("close", closePins(now)),
    autoPinned: quiet ? 0 : await safe("autopick", autoPickForWinners(now)),
    gifts: quiet ? 0 : await safe("gift", giveGift(now)),
    milestones: await safe("milestones", tellMilestones(now)),
  };
}

// What a person sees of their own points (/points): the balance, the week, the lines, the mission,
// their spotlight purchases of the last 2 weeks (each shot: shown of bought, people reached).
export async function myPoints(user: User, now = new Date()) {
  const [balance, week, entries, mission, pins, win] = await Promise.all([
    balanceOf(user.id),
    weekPointsOf(user.id, now),
    db.pointEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    currentMission(now),
    db.homePin.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 3600e3) } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, batch: true, source: true, budget: true, shown: true, reach: true, endsAt: true, closedAt: true, angleId: true, angle: { select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, moment: { select: { title: true } } } } },
    }),
    db.weeklyWinner.findFirst({ where: { userId: user.id, pinId: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return { balance, week, entries, mission, pins, freePin: win ? win.week : null };
}
