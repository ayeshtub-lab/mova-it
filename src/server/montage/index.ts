import type { Montage, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { soundByKey } from "@/lib/sounds";
import { viewUrl } from "@/server/media";

const MAX_ANGLES = 12;
// A render that has not finished in this time is treated as dead and may be retried.
const STALE_RENDER_MS = 10 * 60 * 1000;

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

async function currentAngleIds(momentId: string) {
  const angles = await db.angle.findMany({
    where: { momentId, status: "READY", mediaPath: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    select: { id: true },
    take: MAX_ANGLES,
  });
  return angles.map((a) => a.id);
}

const sameAngles = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const isAlive = (m: Montage) =>
  m.status === "READY" || ((m.status === "QUEUED" || m.status === "RENDERING") && Date.now() - m.createdAt.getTime() < STALE_RENDER_MS);

// Returns the montage for the moment's current angles and sound: an existing one when
// nothing changed (or one is already rendering), otherwise a new queued row to render.
export async function requestMontage(user: User, code: string, rawSound: unknown = null) {
  const soundKey = soundByKey(typeof rawSound === "string" ? rawSound : null)?.key ?? null;
  const moment = await unlockedMoment(user, code);
  const angleIds = await currentAngleIds(moment.id);
  if (!angleIds.length) throw new MontageError("no_angles");

  const latest = await db.montage.findFirst({ where: { momentId: moment.id }, orderBy: { createdAt: "desc" } });
  if (latest && isAlive(latest) && sameAngles(latest.angleIds, angleIds) && latest.soundKey === soundKey) return { montage: latest, created: false };

  const montage = await db.montage.create({ data: { momentId: moment.id, angleIds, soundKey } });
  return { montage, created: true };
}

export async function montageView(montage: Montage) {
  const current = await currentAngleIds(montage.momentId);
  return {
    id: montage.id,
    status: montage.status,
    durationSec: montage.durationSec,
    soundKey: montage.soundKey,
    videoUrl: montage.status === "READY" ? await viewUrl(montage.videoUrl) : null,
    // New angles arrived since this montage was made: offer a fresh one.
    outdated: !sameAngles(montage.angleIds, current),
  };
}

export async function getMontageForViewer(user: User, id: string) {
  const montage = await db.montage.findUnique({ where: { id }, include: { moment: { select: { code: true } } } });
  if (!montage) throw new MontageError("not_found");
  await unlockedMoment(user, montage.moment.code);
  return montageView(montage);
}

// The latest montage of a moment, for the moment page (null when the viewer may not see it).
export async function latestMontageFor(user: User | null, code: string) {
  if (!user) return null;
  try {
    const moment = await unlockedMoment(user, code);
    const latest = await db.montage.findFirst({ where: { momentId: moment.id }, orderBy: { createdAt: "desc" } });
    return latest && isAlive(latest) ? montageView(latest) : null;
  } catch {
    return null;
  }
}
