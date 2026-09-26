import { createHash } from "node:crypto";
import type { Montage, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { soundByKey } from "@/lib/sounds";
import { viewUrl } from "@/server/media";
import { renderMontage } from "./render";

const MAX_ANGLES = 12;
// A render that has not finished in this time is treated as dead and may be retried.
const STALE_RENDER_MS = 10 * 60 * 1000;
// Changes come in bursts (upload, then a look, then a sound): wait for them to settle
// before rendering, so one video is made instead of three.
const SETTLE_MS = 8000;

export class MontageError extends Error {
  constructor(public code: "not_found" | "locked" | "no_angles") {
    super(code);
  }
}

// A montage shows every angle, so it follows "give to get": only the moment's creator
// and people who added an angle may make or watch it.
async function unlockedMoment(user: User, code: string) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment || (moment.status === "HIDDEN" && moment.creatorId !== user.id)) throw new MontageError("not_found");
  if (moment.creatorId === user.id) return moment;
  const contributed = await db.angle.count({ where: { momentId: moment.id, contributorId: user.id, status: "READY" } });
  if (!contributed) throw new MontageError("locked");
  return moment;
}

// The moment's shots as a montage would use them, and a fingerprint of everything that
// shows or sounds in it — the shots, their looks and sounds, and the montage's sound.
async function currentContent(momentId: string, soundKey: string | null) {
  const angles = await db.angle.findMany({
    where: { momentId, status: "READY", mediaPath: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    select: { id: true, filter: true, stamp: true, soundKey: true, muteOriginal: true },
    take: MAX_ANGLES,
  });
  const signature = createHash("sha256")
    .update(JSON.stringify([soundKey, angles.map((a) => [a.id, a.filter, a.stamp, a.soundKey, a.muteOriginal])]))
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

// A person asks for the video (or picks a new sound for it).
export async function requestMontage(user: User, code: string, rawSound: unknown = null) {
  const soundKey = soundByKey(typeof rawSound === "string" ? rawSound : null)?.key ?? null;
  const moment = await unlockedMoment(user, code);
  const result = await montageFor(moment.id, soundKey);
  if (!result) throw new MontageError("no_angles");
  return result;
}

// The moment's video remakes itself after an upload, a look or sound change, or a
// deletion. Runs after the response; `host` is the public host for the link in the video.
export async function refreshMontage(momentId: string, host: string) {
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const result = await montageFor(momentId, await chosenSound(momentId));
  if (result?.created) await renderMontage(result.montage.id, host);
}

export async function refreshMontageForAngle(angleId: string, host: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { momentId: true, status: true } });
  if (angle?.status === "READY") await refreshMontage(angle.momentId, host);
}

export type MontageView = Awaited<ReturnType<typeof momentVideo>>;

// What the moment page shows: the latest finished video (kept on screen while a newer
// one is being made), whether a newer one is on its way, and the moment's hearts.
async function momentVideo(user: User, momentId: string) {
  const [latest, ready, likes, liked, current] = await Promise.all([
    db.montage.findFirst({ where: { momentId }, orderBy: { createdAt: "desc" } }),
    db.montage.findFirst({ where: { momentId, status: "READY" }, orderBy: { createdAt: "desc" } }),
    db.momentLike.count({ where: { momentId } }),
    db.momentLike.count({ where: { momentId, userId: user.id } }),
    chosenSound(momentId).then((sound) => currentContent(momentId, sound)),
  ]);
  return {
    id: ready?.id ?? null,
    durationSec: ready?.durationSec ?? null,
    soundKey: latest?.soundKey ?? null,
    videoUrl: ready ? await viewUrl(ready.videoUrl) : null,
    updating: !!latest && isWorking(latest),
    failed: latest?.status === "FAILED",
    // Nothing is making a video for the current content (an older moment, or a failed
    // render): the page offers to make it.
    outdated: current.angleIds.length > 0 && !(latest && isAlive(latest) && latest.signature === current.signature),
    likes,
    liked: liked > 0,
  };
}

export async function momentVideoFor(user: User, code: string) {
  const moment = await unlockedMoment(user, code);
  return momentVideo(user, moment.id);
}

// For the moment page (null when the viewer may not see the video).
export async function latestMontageFor(user: User | null, code: string) {
  if (!user) return null;
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
