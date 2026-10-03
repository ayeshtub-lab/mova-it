import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import type { Montage, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseCaption } from "@/lib/caption";
import { wordsMark } from "@/lib/lyrics";
import { soundByKey } from "@/lib/sounds";
import { blobExists, viewUrl } from "@/server/media";
import { systemUser } from "@/server/daily";
import { notify } from "@/server/notifications";
import { buildMontageVideo, filmLimit, fitsFilm, renderMontage } from "./render";

// A moment's video shows every shot (near-duplicates aside) as long as it stays within 40
// seconds — each shot gets shorter as there are more (src/server/montage/render.ts). Past
// this many, the best are kept: «⭐ اختيار زاومو», then the most liked, one per person first.
const MAX_ANGLES = 48;
// The same person's shots this close in time are one shot taken twice: only the best stays.
const DUPLICATE_MS = 20_000;
// After the first video, a new version waits for a few new shots — or for things to go
// quiet — so a busy wedding makes two or three versions, not one per guest.
const BATCH_SHOTS = 3;
const QUIET_MS = 30 * 60 * 1000;
// A moment's video needs this many angles; made by hand the first time, by the owner of
// the moment's first angle, then kept up to date by itself.
export const MIN_ANGLES = 5;
// «مع الوقت»: a story's video is its shots in date order, quickly, like time passing — from
// three shots, and at most STORY_MAX of them, spread evenly from the first to the latest.
export const STORY_MIN = 3;
const STORY_MAX = 40;

async function sizeFor(momentId: string) {
  const moment = await db.moment.findUnique({ where: { id: momentId }, select: { kind: true } });
  return moment?.kind === "STORY" ? { story: true, min: STORY_MIN, max: STORY_MAX } : { story: false, min: MIN_ANGLES, max: MAX_ANGLES };
}

// `n` items spread evenly over the list, the first and the last always in.
export function spread<T>(items: T[], n: number) {
  if (items.length <= n) return items;
  if (n <= 1) return items.slice(-1);
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}
// A render that has not finished in this time is treated as dead and may be retried.
const STALE_RENDER_MS = 10 * 60 * 1000;
// Changes come in bursts (upload, then a look, then a sound): wait for them to settle
// before rendering, so one video is made instead of three.
const SETTLE_MS = 8000;

export class MontageError extends Error {
  constructor(public code: "not_found" | "locked" | "no_angles" | "too_few" | "not_maker") {
    super(code);
  }
}

// A montage shows every angle, so it follows "give to get": only the moment's creator
// and people who added an angle may make or watch it.
async function unlockedMoment(user: User, code: string) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment || (moment.status === "HIDDEN" && moment.creatorId !== user.id)) throw new MontageError("not_found");
  // A «مع الوقت» story is open to whoever holds it (nobody else adds to it); a public moment's
  // video is for everyone — it is what makes a visitor want to add theirs.
  if (moment.creatorId === user.id || moment.kind === "STORY" || moment.visibility === "PUBLIC") return moment;
  const contributed = await db.angle.count({ where: { momentId: moment.id, contributorId: user.id, status: "READY" } });
  if (!contributed) throw new MontageError("locked");
  return moment;
}

// The look of the film itself (motion, transitions, title, ending): a new style makes every
// moment's video again the next time it's asked for.
const MONTAGE_STYLE = "pro-1";

type Candidate = { id: string; contributorId: string; mediaType: string; capturedAt: Date | null; uploadedAt: Date; pickedAt: Date | null };

// A moment's shots for its video, in the order they were taken: near-duplicates dropped (the
// same person, the same kind of shot, within DUPLICATE_MS — the best of them stays), and past
// `max` the best kept: one per person first, then by «⭐ اختيار زاومو» and hearts.
export async function bestShots<T extends Candidate>(shots: T[], max: number, limit?: number): Promise<T[]> {
  if (!shots.length) return shots;
  const ids = shots.map((s) => s.id);
  const [likes, comments] = await Promise.all([
    db.reaction.groupBy({ by: ["angleId"], where: { angleId: { in: ids } }, _count: { _all: true } }),
    db.comment.groupBy({ by: ["angleId"], where: { angleId: { in: ids } }, _count: { _all: true } }),
  ]);
  const l = new Map(likes.map((r) => [r.angleId, r._count._all]));
  const c = new Map(comments.map((r) => [r.angleId, r._count._all]));
  const score = (s: T) => (s.pickedAt ? 1_000_000 : 0) + 3 * (l.get(s.id) ?? 0) + 4 * (c.get(s.id) ?? 0);
  const at = (s: T) => (s.capturedAt ?? s.uploadedAt).getTime();
  // Clusters of near-duplicates, kept in time order. Only shots whose time came from the camera
  // (whole seconds): without it (a scanned print, a photo sent over WhatsApp) the phone gives the
  // file's date, to the millisecond, and ten photos saved together are not duplicates.
  const fromCamera = (s: T) => !!s.capturedAt && s.capturedAt.getMilliseconds() === 0;
  const kept: T[] = [];
  for (const s of shots) {
    const twin = fromCamera(s)
      ? kept.find((k) => fromCamera(k) && k.contributorId === s.contributorId && k.mediaType === s.mediaType && Math.abs(at(k) - at(s)) <= DUPLICATE_MS)
      : undefined;
    if (!twin) kept.push(s);
    else if (score(s) > score(twin)) kept[kept.indexOf(twin)] = s;
  }
  // Everything that fits a 40-second film (videos take about twice a photo's time).
  const fits = (list: T[]) => fitsFilm(list.filter((s) => s.mediaType !== "VIDEO").length, list.filter((s) => s.mediaType === "VIDEO").length, false, limit);
  if (kept.length <= max && fits(kept)) return kept;
  const ranked = [...kept].sort((a, b) => score(b) - score(a) || at(a) - at(b));
  const chosen: T[] = [];
  const people = new Set<string>();
  const tryAdd = (s: T) => {
    if (chosen.length >= max || chosen.includes(s) || !fits([...chosen, s])) return;
    chosen.push(s);
    people.add(s.contributorId);
  };
  for (const s of ranked) if (!people.has(s.contributorId)) tryAdd(s);
  for (const s of ranked) tryAdd(s);
  return kept.filter((s) => chosen.includes(s));
}

// The moment's shots as a montage would use them, and a fingerprint of everything that
// shows or sounds in it — the shots, their looks and sounds, and the montage's sound.
async function currentContent(momentId: string, soundKey: string | null) {
  const size = await sizeFor(momentId);
  const found = await db.angle.findMany({
    where: { momentId, status: "READY", mediaPath: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    select: { id: true, filter: true, stamp: true, soundKey: true, muteOriginal: true, lyrics: true, caption: true, contributorId: true, mediaType: true, capturedAt: true, uploadedAt: true, pickedAt: true },
  });
  // A story keeps its whole span, spread evenly; a moment its distinct shots, best ones past the cap.
  const angles = size.story ? spread(found, size.max) : await bestShots(found, size.max, filmLimit(soundKey));
  const signature = createHash("sha256")
    .update(JSON.stringify([MONTAGE_STYLE, soundKey, ...wordsMark(soundKey), angles.map((a) => [a.id, a.filter, a.stamp, a.soundKey, a.muteOriginal, parseCaption(a.caption)?.path ?? null, ...wordsMark(a.soundKey, a.lyrics)])]))
    .digest("hex")
    .slice(0, 32);
  return { angleIds: angles.map((a) => a.id), signature };
}

const isAlive = (m: Montage) =>
  m.status === "READY" || ((m.status === "QUEUED" || m.status === "RENDERING") && Date.now() - m.createdAt.getTime() < STALE_RENDER_MS);
const isWorking = (m: Montage) => m.status !== "READY" && isAlive(m);

// The montage for the moment's current content: the existing one when nothing changed
// (or one is already rendering), otherwise a new queued row to render.
async function montageFor(momentId: string, soundKey: string | null) {
  const { angleIds, signature } = await currentContent(momentId, soundKey);
  if (!angleIds.length) return null;
  const latest = await db.montage.findFirst({ where: { momentId }, orderBy: { createdAt: "desc" } });
  if (latest && isAlive(latest) && latest.signature === signature) return { montage: latest, created: false };
  const montage = await db.montage.create({ data: { momentId, angleIds, soundKey, signature } });
  return { montage, created: true };
}

// The sound the moment's video uses: whatever was last chosen for it.
async function chosenSound(momentId: string) {
  const latest = await db.montage.findFirst({ where: { momentId }, orderBy: { createdAt: "desc" }, select: { soundKey: true } });
  return latest?.soundKey ?? null;
}

const liveAngles = (momentId: string) => ({
  momentId,
  status: "READY" as const,
  mediaPath: { not: null },
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

// How many angles the moment has, and who may make its video: the owner of the angle
// added first.
async function videoRights(momentId: string) {
  const [count, first] = await Promise.all([
    db.angle.count({ where: liveAngles(momentId) }),
    db.angle.findFirst({ where: liveAngles(momentId), orderBy: { uploadedAt: "asc" }, select: { contributorId: true } }),
  ]);
  return { count, makerId: first?.contributorId ?? null };
}

// A video was made by hand once the moment had enough angles: from then on it keeps
// itself up to date.
async function madeByHand(momentId: string) {
  const made = await db.montage.findMany({ where: { momentId }, select: { angleIds: true } });
  const { min } = await sizeFor(momentId);
  return made.some((m) => m.angleIds.length >= min);
}

// «🎬 صار فيك تعمل الفيديو»: the shot just published brought the moment to enough shots for
// its video. Its maker (the owner of the first shot) is told once — never again for this
// moment, and not at all once a video has been made. Not for «لحظة اليوم».
export async function offerVideo(angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { status: true, momentId: true, moment: { select: { kind: true } } } });
  if (!angle || angle.status !== "READY" || angle.moment.kind === "DAILY") return;
  const [rights, size] = await Promise.all([videoRights(angle.momentId), sizeFor(angle.momentId)]);
  if (!rights.makerId || rights.count < size.min || (await madeByHand(angle.momentId))) return;
  const first = await db.angle.findFirst({ where: liveAngles(angle.momentId), orderBy: { uploadedAt: "asc" }, select: { id: true } });
  if (!first) return;
  await notify(
    { userId: rights.makerId, actorId: (await systemUser()).id, kind: "VIDEO_READY", angleId: first.id },
    { key: `video-ready:${angle.momentId}`, where: { userId: rights.makerId, kind: "VIDEO_READY", angle: { momentId: angle.momentId } } },
  );
}

// The maker asks for the video (or picks a new sound for it).
export async function requestMontage(user: User, code: string, rawSound: unknown = null) {
  const soundKey = soundByKey(typeof rawSound === "string" ? rawSound : null)?.key ?? null;
  const moment = await unlockedMoment(user, code);
  const rights = await videoRights(moment.id);
  if (rights.count < (await sizeFor(moment.id)).min) throw new MontageError("too_few");
  if (rights.makerId !== user.id) throw new MontageError("not_maker");
  const result = await montageFor(moment.id, soundKey);
  if (!result) throw new MontageError("no_angles");
  return result;
}

// The moment's video remakes itself after an upload, a look or sound change, or a
// deletion — once it has been made by hand. Runs after the response; `host` is the
// public host for the link in the video.
export async function refreshMontage(momentId: string, host: string, { settle = true, now = new Date() } = {}) {
  if (settle) await new Promise((r) => setTimeout(r, SETTLE_MS));
  if ((await videoRights(momentId)).count < (await sizeFor(momentId)).min || !(await madeByHand(momentId))) return;
  // One or two new shots while people are still adding: wait (refreshPendingMontages picks it
  // up once it goes quiet). Looks, sounds, writing and deletions remake it at once.
  if (await waitForMore(momentId, now)) return;
  const result = await montageFor(momentId, await chosenSound(momentId));
  if (result?.created) await renderMontage(result.montage.id, host);
}

export async function waitForMore(momentId: string, now = new Date()) {
  const [shown, current, newest] = await Promise.all([
    db.montage.findFirst({ where: { momentId, status: "READY" }, orderBy: { createdAt: "desc" }, select: { angleIds: true } }),
    chosenSound(momentId).then((sound) => currentContent(momentId, sound)),
    db.angle.findFirst({ where: liveAngles(momentId), orderBy: { uploadedAt: "desc" }, select: { uploadedAt: true } }),
  ]);
  if (!shown) return false;
  const added = current.angleIds.filter((id) => !shown.angleIds.includes(id)).length;
  const quiet = !newest || now.getTime() - newest.uploadedAt.getTime() >= QUIET_MS;
  return added > 0 && added < BATCH_SHOTS && !quiet;
}

// Has this moment's film been failing lately? A try counts as failed when it says so, or when it
// stopped without finishing (still «QUEUED»/«RENDERING» past the time a render takes).
export async function failingLately(momentId: string, now: Date) {
  const tries = await db.montage.findMany({
    where: { momentId, status: { not: "READY" }, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true },
  });
  const failed = tries.filter((t) => t.status === "FAILED" || now.getTime() - t.createdAt.getTime() >= STALE_RENDER_MS);
  if (!failed.length) return false;
  if (failed.length >= 3) return true; // a day off
  return now.getTime() - failed[0].createdAt.getTime() < 6 * 60 * 60 * 1000;
}

// Every quarter hour (/api/cron/montages): videos left waiting for more shots are made once
// things have gone quiet — and so are videos made before the way films are cut changed
// (which shots, how long), so every moment catches up by itself. One per run, so a run stays
// short. One that failed — or never finished (a render the platform cut off stays «RENDERING»)
// — waits 6 hours before it is tried again, and after 3 such tries in a day it waits a day:
// a film that can't be made must not be retried every quarter hour (each try costs minutes).
export async function refreshPendingMontages(host: string, limit = 1, now = new Date()) {
  const quietSince = new Date(now.getTime() - QUIET_MS);
  const candidates = await db.moment.findMany({
    where: { montages: { some: { status: "READY" } } },
    orderBy: { lastActivityAt: "desc" },
    select: { id: true },
    take: 100,
  });
  let made = 0;
  for (const { id } of candidates) {
    if (made >= limit) break;
    const [ready, last, newest] = await Promise.all([
      db.montage.findFirst({ where: { momentId: id, status: "READY" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, signature: true } }),
      db.montage.findFirst({ where: { momentId: id }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } }),
      db.angle.findFirst({ where: liveAngles(id), orderBy: { uploadedAt: "desc" }, select: { uploadedAt: true } }),
    ]);
    if (!ready || !newest || newest.uploadedAt > quietSince) continue;
    if (last && last.status !== "READY" && (await failingLately(id, now))) continue;
    const current = await currentContent(id, await chosenSound(id));
    if (newest.uploadedAt <= ready.createdAt && ready.signature === current.signature) continue;
    const before = await db.montage.count({ where: { momentId: id } });
    await refreshMontage(id, host, { settle: false, now }).catch((error) => console.error("pending montage failed", id, error));
    if ((await db.montage.count({ where: { momentId: id } })) > before) made++;
  }
  return made;
}

export async function refreshMontageForAngle(angleId: string, host: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { momentId: true, status: true } });
  if (angle?.status === "READY") await refreshMontage(angle.momentId, host);
}

// «🆕 الجديد»: the shots the latest version of the video added to the version before it (still
// there, in film order) — what someone who shared the earlier video hasn't shown yet.
async function newShotIds(momentId: string) {
  const ready = await db.montage.findMany({ where: { momentId, status: "READY" }, orderBy: { createdAt: "desc" }, take: 10, select: { angleIds: true } });
  const [latest, ...older] = ready;
  const before = latest && older.find((m) => m.angleIds.join() !== latest.angleIds.join());
  if (!latest || !before) return [];
  const live = await db.angle.findMany({ where: { ...liveAngles(momentId), id: { in: latest.angleIds } }, select: { id: true } });
  const alive = new Set(live.map((a) => a.id));
  return latest.angleIds.filter((id) => !before.angleIds.includes(id) && alive.has(id));
}

const NEW_STYLE = "new-1";

// The short film of what's new (two shots at least), made when asked and kept next to the
// moment's videos; the same people who may watch the video may ask for it.
export async function newShotsVideoUrl(user: User, code: string, siteHost: string, kicker: string) {
  const moment = await unlockedMoment(user, code);
  const ids = await newShotIds(moment.id);
  if (ids.length < 2) throw new MontageError("too_few");
  const found = await db.angle.findMany({ where: { id: { in: ids } }, include: { contributor: { select: { displayName: true } } } });
  const angles = ids.map((id) => found.find((a) => a.id === id)).filter((a) => !!a);
  const soundKey = await chosenSound(moment.id);
  const version = createHash("sha256")
    .update(JSON.stringify([NEW_STYLE, MONTAGE_STYLE, soundKey, ...wordsMark(soundKey), siteHost, kicker, angles.map((a) => [a.id, a.filter, a.stamp, a.soundKey, a.muteOriginal, parseCaption(a.caption)?.path ?? null, ...wordsMark(a.soundKey, a.lyrics)])]))
    .digest("hex")
    .slice(0, 16);
  const path = `m/${moment.id}/new-${version}.mp4`;
  if (!(await blobExists(path))) {
    const dir = await mkdtemp(join(tmpdir(), "zawmo-new-"));
    try {
      const participants = await db.participant.count({ where: { momentId: moment.id } });
      const { output } = await buildMontageVideo({ moment, angles, participants, soundKey, siteHost, kicker }, dir);
      await put(path, await readFile(output), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return viewUrl(path);
}

export type MontageView = Awaited<ReturnType<typeof momentVideo>>;

// What the moment page shows: the latest finished video (kept on screen while a newer
// one is being made), whether a newer one is on its way, and the moment's hearts.
async function momentVideo(user: User | null, momentId: string) {
  const [latest, ready, likes, liked, current, rights, size] = await Promise.all([
    db.montage.findFirst({ where: { momentId }, orderBy: { createdAt: "desc" } }),
    db.montage.findFirst({ where: { momentId, status: "READY" }, orderBy: { createdAt: "desc" } }),
    db.momentLike.count({ where: { momentId } }),
    user ? db.momentLike.count({ where: { momentId, userId: user.id } }) : 0,
    chosenSound(momentId).then((sound) => currentContent(momentId, sound)),
    videoRights(momentId),
    sizeFor(momentId),
  ]);
  // Below the minimum there is no video at all (an older one made with fewer angles
  // stays hidden): the page shows how many angles are still missing.
  const enough = rights.count >= size.min;
  return {
    id: enough ? (ready?.id ?? null) : null,
    durationSec: enough ? (ready?.durationSec ?? null) : null,
    soundKey: latest?.soundKey ?? null,
    videoUrl: enough && ready ? await viewUrl(ready.videoUrl) : null,
    updating: enough && !!latest && isWorking(latest),
    failed: enough && latest?.status === "FAILED",
    // Nothing is making a video for the current content (never made, or a failed
    // render): the maker is offered the button.
    outdated: enough && !(latest && isAlive(latest) && latest.signature === current.signature),
    angleCount: rights.count,
    minAngles: size.min,
    canMake: !!user && rights.makerId === user.id,
    // How many shots «🆕 فيديو الجديد» would show (offered from two).
    newShots: user && enough && ready ? (await newShotIds(momentId)).length : 0,
    likes,
    liked: liked > 0,
  };
}

export async function momentVideoFor(user: User, code: string) {
  const moment = await unlockedMoment(user, code);
  return momentVideo(user, moment.id);
}

// A visitor (not signed in) sees a public moment's video.
export async function publicMomentVideo(code: string) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() }, select: { id: true, visibility: true, status: true } });
  if (!moment || moment.visibility !== "PUBLIC" || moment.status === "HIDDEN") return null;
  return momentVideo(null, moment.id);
}

// For the moment page (null when the viewer may not see the video).
export async function latestMontageFor(user: User | null, code: string) {
  if (!user) return publicMomentVideo(code);
  try {
    return await momentVideoFor(user, code);
  } catch {
    return null;
  }
}

// A heart on the moment's video.
export async function setMomentLike(user: User, code: string, liked: boolean) {
  const moment = await unlockedMoment(user, code);
  if (liked) {
    await db.momentLike.upsert({
      where: { momentId_userId: { momentId: moment.id, userId: user.id } },
      create: { momentId: moment.id, userId: user.id },
      update: {},
    });
  } else await db.momentLike.deleteMany({ where: { momentId: moment.id, userId: user.id } });
  return { likes: await db.momentLike.count({ where: { momentId: moment.id } }), liked };
}
