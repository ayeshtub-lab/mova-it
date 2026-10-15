import type { Montage } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isQuran } from "@/lib/sounds";
import { notify } from "@/server/notifications";
import { systemUser } from "@/server/daily";
import { resolveSound } from "@/server/sound-resolve";
import { bestShots, MIN_ANGLES, PARTS_SHOWN } from "./index";
import { renderMontage } from "./render";
import { viewUrl } from "@/server/media";

// «أجزاء» (agreed with the owner of the site, 2026-10-15): a moment's film no longer squeezes every
// shot into one 40-second video that is remade as shots arrive (cutting duaas short, skipping
// words). Instead its shots, in the order they were taken, go into parts of up to 40 seconds —
// each shot whole: a video its full length, a photo with a sound as long as its sound, a silent
// photo a few seconds over Zawmo's calm sound. Part 1 is the first 40 seconds, part 2 the next…
// Each part is made once, by itself (no button), and then stays as it is (a lasting file and
// page for Google); a shot deleted from it remakes that part only. Everyone with a shot in the
// moment hears of each new part.
//
// Gently on the server: the cron makes ONE part per run (every 15 minutes) across the whole site.
// Until PARTS_SHOWN is on, parts are made but not shown or announced (checked first by hand).

export { PARTS_SHOWN } from "./index";

const LIMIT = 40;
const INTRO = 1.8;
const OUTRO = 2.6;
const T = 0.45;
const PHOTO = 3.2; // a photo without a sound
const PHOTO_MAX = 8; // …stretched up to this to fill a part made when things went quiet
const SOUND_MIN = 3.2; // a photo with a sound stays as long as its sound, within these
const SOUND_MAX = 14;
// A part with room left waits for more shots — unless nothing came for this long, then it is
// made with what there is (a first part needs MIN_ANGLES shots) — but never under 38 seconds: a
// part is 38 to 40 seconds long (his rule, 2026-10-15); one that can't reach it waits for more.
const QUIET_MS = 2 * 60 * 60 * 1000;
const MIN_SECONDS = 38;
// A part counts as full from here: a shorter one is never closed just because the next shot is
// long (that shot waits for a part of its own, and later shots fill this one).
const FULL_FROM = 38;
const STALE_MS = 15 * 60 * 1000;
// How parts are made: a part made another way is made again (quietly, one per run, nobody told).
// "fill-1": each silent photo with a sound of its own (2026-10-15), not one sound under them all.
const PART_STYLE = "fill-1";

type Shot = { id: string; contributorId: string; mediaType: string; capturedAt: Date | null; uploadedAt: Date; pickedAt: Date | null; durationSec: number | null; soundKey: string | null };

// The length of a part: the cards, every shot, less the overlaps of the transitions — or, for
// one shot too long to leave room for the cards, the shot alone (see `withCards`).
export const withCards = (seconds: number[]) => !(seconds.length === 1 && INTRO + OUTRO + seconds[0] - 2 * T > LIMIT);
export const partLength = (seconds: number[]) =>
  withCards(seconds) ? INTRO + OUTRO + seconds.reduce((a, b) => a + b, 0) - T * (seconds.length + 1) : seconds.reduce((a, b) => a + b, 0);

// How long each shot stays in a part, whole.
export async function shotSeconds(shot: Pick<Shot, "mediaType" | "durationSec" | "soundKey">) {
  const sound = await resolveSound(shot.soundKey);
  // A video plays whole — and stays on its last frame while a verse laid on it is still heard
  // (render.ts withShotSound): counted at the verse's length then, so the part never runs over.
  if (shot.mediaType === "VIDEO") return Math.max(1, Math.min(LIMIT, shot.durationSec ?? 6), isQuran(sound) ? sound!.seconds + 0.8 : 0);
  if (!sound) return PHOTO;
  // A verse is heard once and whole, however long (as everywhere on Zawmo).
  if (isQuran(sound)) return sound.seconds + 0.8;
  return Math.min(SOUND_MAX, Math.max(SOUND_MIN, sound.seconds));
}

// The shots that go into the next part: the next ones in time order, as many as fit in 40
// seconds. `full` when it reached FULL_FROM and the next shot doesn't fit. A shot that doesn't fit
// a part not yet full is left for a later part (the shots after it fill this one). A shot that
// fills a part by itself (a 39-second video) makes a part of its own, without the cards.
export async function nextPart(pending: Shot[]) {
  const shots: Shot[] = [];
  const seconds: number[] = [];
  for (const shot of pending) {
    const s = await shotSeconds(shot);
    if (shots.length && partLength([...seconds, s]) > LIMIT) {
      if (partLength(seconds) >= FULL_FROM) return { shots, seconds, full: true };
      continue;
    }
    shots.push(shot);
    seconds.push(s);
    if (partLength(seconds) >= FULL_FROM && !withCards(seconds)) return { shots, seconds, full: true };
    if (partLength(seconds) >= LIMIT - 0.5) return { shots, seconds, full: true };
  }
  return { shots, seconds, full: false };
}

// A part made before it is full (things went quiet): its silent photos stay a little longer, so it
// comes as close to 40 seconds as it can.
export function stretch(shots: Pick<Shot, "mediaType" | "soundKey">[], seconds: number[]) {
  const out = [...seconds];
  const silent = shots.map((s, i) => (s.mediaType !== "VIDEO" && !s.soundKey ? i : -1)).filter((i) => i >= 0);
  if (!silent.length) return out;
  const room = LIMIT - partLength(out);
  if (room <= 0) return out;
  const each = Math.min(PHOTO_MAX - PHOTO, room / silent.length);
  for (const i of silent) out[i] = Math.round((out[i] + each) * 100) / 100;
  return out;
}

// A moment's shots that may go into its films, in the order they were taken (near-duplicates out —
// the same person's same shot seconds apart; never one that is clearly someone else's).
async function liveShots(momentId: string) {
  const found = await db.angle.findMany({
    where: { momentId, status: "READY", mediaPath: { not: null }, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, { OR: [{ screening: null }, { screening: { not: "repost" } }] }] },
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    select: { id: true, contributorId: true, mediaType: true, capturedAt: true, uploadedAt: true, pickedAt: true, durationSec: true, soundKey: true },
  });
  return bestShots(found, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}

const alive = (m: Pick<Montage, "status" | "createdAt">) => m.status === "READY" || ((m.status === "QUEUED" || m.status === "RENDERING") && Date.now() - m.createdAt.getTime() < STALE_MS);

// A part's name: the moment's, the part's number, and what its shots show (their SEO titles —
// src/server/screening.ts) — close to its sisters, never the same.
async function partTitle(momentTitle: string, part: number, shotIds: string[]) {
  const titled = await db.angle.findMany({ where: { id: { in: shotIds }, aiTitle: { not: null } }, select: { id: true, aiTitle: true } });
  const words = shotIds.map((id) => titled.find((t) => t.id === id)?.aiTitle).filter((t): t is string => !!t);
  const about = words[0] ?? "";
  return `${momentTitle} — الجزء ${part.toLocaleString("ar-EG")}${about ? `: ${about}` : ""}`.slice(0, 160);
}

// What a moment needs next, if anything: a part to remake (one of its shots is gone), or a new part
// from the shots no part has yet. Null when nothing is due.
export async function duePart(momentId: string, now = new Date()) {
  const moment = await db.moment.findUnique({ where: { id: momentId }, select: { id: true, title: true, kind: true, status: true } });
  if (!moment || moment.kind === "STORY" || moment.kind === "DAILY" || moment.status !== "ACTIVE") return null;
  const parts = (await db.montage.findMany({ where: { momentId, part: { not: null } }, orderBy: { createdAt: "desc" } })).filter(alive);
  if (parts.some((p) => p.status !== "READY")) return null; // one is being made
  const latest = new Map<number, Montage>();
  for (const p of parts) if (!latest.has(p.part!)) latest.set(p.part!, p);
  const shots = await liveShots(momentId);
  const live = new Set(shots.map((s) => s.id));

  // A part that lost a shot: made again without it (the others stay where they are) — and one made
  // in an older style, again with the same shots.
  for (const [part, made] of [...latest].sort((a, b) => a[0] - b[0])) {
    if (made.angleIds.every((id) => live.has(id)) && made.signature?.startsWith(`${PART_STYLE}:`)) continue;
    const kept = shots.filter((s) => made.angleIds.includes(s.id));
    // Every shot of it gone: the part goes (its number is not reused while others follow it).
    if (!kept.length) {
      await db.montage.updateMany({ where: { momentId, part, status: "READY" }, data: { status: "FAILED", error: "emptied" } });
      continue;
    }
    return { part, shots: kept, seconds: stretch(kept, await Promise.all(kept.map(shotSeconds))), title: made.title ?? (await partTitle(moment.title, part, kept.map((s) => s.id))), remake: true };
  }

  // A moment's first part waits for MIN_ANGLES shots (as its one film always did).
  if (!latest.size && shots.length < MIN_ANGLES) return null;
  const used = new Set([...latest.values()].flatMap((m) => m.angleIds));
  const pending = shots.filter((s) => !used.has(s.id));
  if (!pending.length) return null;
  const next = await nextPart(pending);
  if (!next.shots.length) return null;
  const part = (Math.max(0, ...latest.keys()) || 0) + 1;
  if (!next.full) {
    // A shot that fills a part by itself (left out above because it didn't fit beside the
    // others): its own part now — it never waits behind shorter ones.
    for (const shot of pending) {
      const s = await shotSeconds(shot);
      if (partLength([s]) >= FULL_FROM) return { part, shots: [shot], seconds: [s], title: await partTitle(moment.title, part, [shot.id]), remake: false };
    }
    // Room left: wait for more — unless nothing came for a while.
    const newest = Math.max(...pending.map((s) => s.uploadedAt.getTime()));
    if (now.getTime() - newest < QUIET_MS) return null;
    if (part === 1 && next.shots.length < MIN_ANGLES) return null;
    next.seconds = stretch(next.shots, next.seconds);
    if (partLength(next.seconds) < MIN_SECONDS) return null;
  }
  return { part, shots: next.shots, seconds: next.seconds, title: await partTitle(moment.title, part, next.shots.map((s) => s.id)), remake: false };
}

// Every 15 minutes (cron «montages»): ONE part made across the whole site — the most recently
// active moments first. Returns the montage made, or null.
export async function makeDuePart(host: string, now = new Date()) {
  const moments = await db.moment.findMany({
    where: { kind: { in: ["EVERYDAY", "BIG"] }, status: "ACTIVE", angles: { some: { status: "READY" } } },
    orderBy: { lastActivityAt: "desc" },
    select: { id: true },
    take: 200,
  });
  for (const { id } of moments) {
    // (A moment whose parts keep failing waits: never a retry loop.)
    if (await partsFailing(id, now)) continue;
    const due = await duePart(id, now);
    if (!due) continue;
    const montage = await db.montage.create({
      data: { momentId: id, part: due.part, title: due.title, angleIds: due.shots.map((s) => s.id), signature: `${PART_STYLE}:part-${due.part}-${due.shots.map((s) => s.id).join(",")}`.slice(0, 190), soundKey: null },
    });
    await renderMontage(montage.id, host, { plan: due.seconds, fill: true, cards: withCards(due.seconds) });
    const made = await db.montage.findUnique({ where: { id: montage.id } });
    // Told only for parts of fresh shots (a week): an old moment turned into parts by itself is
    // not news to anyone.
    const fresh = due.shots.some((s) => now.getTime() - s.uploadedAt.getTime() < 7 * 24 * 60 * 60 * 1000);
    if (made?.status === "READY" && !due.remake && fresh && PARTS_SHOWN) await announcePart(made).catch((error) => console.error("part notice failed", made.id, error));
    return made;
  }
  return null;
}

// Three failed tries in a day: that moment's parts wait a day.
async function partsFailing(momentId: string, now: Date) {
  const failed = await db.montage.count({ where: { momentId, part: { not: null }, status: "FAILED", createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, NOT: [{ error: { startsWith: "partial " } }, { error: "emptied" }] } });
  return failed >= 3;
}

// «🎬 لقطتك صارت بفيديو!»: everyone whose shot is IN this part — and the moment's creator
// («🎬 فيديو جديد للحظتك جاهز!» when none of theirs is in it). The notice carries the person's own
// shot when they have one there (that is how its words know which to say — notifications.ts).
// One unread notice per person and moment, brought back to the top by each new part.
async function announcePart(montage: Montage) {
  const [moment, shots, zawmo] = await Promise.all([
    db.moment.findUnique({ where: { id: montage.momentId }, select: { creatorId: true } }),
    db.angle.findMany({ where: { id: { in: montage.angleIds }, status: "READY" }, select: { id: true, contributorId: true } }),
    systemUser(),
  ]);
  const told = new Set([moment?.creatorId, ...shots.map((p) => p.contributorId)].filter((id): id is string => !!id));
  for (const userId of told) {
    const angleId = montage.angleIds.find((id) => shots.some((s) => s.id === id && s.contributorId === userId)) ?? montage.angleIds[0];
    const pending = await db.notification.findFirst({ where: { userId, kind: "FILM_PART", readAt: null, angle: { momentId: montage.momentId } }, select: { id: true } });
    if (pending) await db.notification.update({ where: { id: pending.id }, data: { count: { increment: 1 }, createdAt: new Date(), angleId } });
    else await notify({ userId, actorId: zawmo.id, kind: "FILM_PART", angleId });
  }
}

// A moment's finished parts, in order — the latest make of each — with their names as they read
// now (a shot's SEO title may have come after the part was made). `lasting`: a public moment's
// parts play from their lasting addresses (/v/CODE-N.mp4), which Google keeps.
export async function filmParts(momentId: string, code: string, lasting: boolean) {
  const made = await db.montage.findMany({ where: { momentId, part: { not: null }, status: "READY", videoUrl: { not: null } }, orderBy: { createdAt: "desc" } });
  const latest = new Map<number, Montage>();
  for (const m of made) if (!latest.has(m.part!)) latest.set(m.part!, m);
  const moment = await db.moment.findUnique({ where: { id: momentId }, select: { title: true } });
  return Promise.all(
    [...latest.values()]
      .sort((a, b) => a.part! - b.part!)
      .map(async (m) => ({
        part: m.part!,
        title: moment ? await partTitle(moment.title, m.part!, m.angleIds) : (m.title ?? ""),
        durationSec: m.durationSec,
        at: m.finishedAt ?? m.createdAt,
        poster: m.angleIds[0] ?? null,
        url: lasting ? `/v/${code}-${m.part}.mp4` : await viewUrl(m.videoUrl),
      })),
  );
}
export type FilmPart = Awaited<ReturnType<typeof filmParts>>[number];

// A public moment's part, for its own page and lasting address.
export async function publicPart(code: string, part: number) {
  const m = await db.montage.findFirst({
    where: { part, status: "READY", videoUrl: { not: null }, moment: { code, visibility: "PUBLIC", status: "ACTIVE", kind: { in: ["EVERYDAY", "BIG"] }, demo: false } },
    orderBy: { createdAt: "desc" },
    include: { moment: { select: { title: true } } },
  });
  if (!m) return null;
  return { path: m.videoUrl!, part, title: await partTitle(m.moment.title, part, m.angleIds), durationSec: m.durationSec, at: m.finishedAt ?? m.createdAt, poster: m.angleIds[0] ?? null };
}

// Every public moment's parts, for the sitemap.
export async function sitemapParts() {
  const made = await db.montage.findMany({
    where: { part: { not: null }, status: "READY", videoUrl: { not: null }, moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { in: ["EVERYDAY", "BIG"] }, demo: false } },
    orderBy: { createdAt: "desc" },
    select: { part: true, angleIds: true, durationSec: true, finishedAt: true, createdAt: true, moment: { select: { code: true, title: true } } },
  });
  const seen = new Set<string>();
  const out = [];
  for (const m of made) {
    const key = `${m.moment.code}-${m.part}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code: m.moment.code, part: m.part!, title: await partTitle(m.moment.title, m.part!, m.angleIds), durationSec: m.durationSec, at: m.finishedAt ?? m.createdAt, poster: m.angleIds[0] ?? null });
  }
  return out;
}
