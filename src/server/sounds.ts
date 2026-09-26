import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { filterByKey } from "@/lib/filters";
import { isSolemn, soundByKey } from "@/lib/sounds";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";

// Sounds on angles: the contributor picks one from the library (or removes it), and
// whether a video's own sound is muted under it — always muted under remembrance.

export class SoundError extends Error {
  constructor(public code: "not_found" | "invalid" | "forbidden") {
    super(code);
  }
}

export async function setAngleSound(user: User, angleId: string, rawKey: unknown, rawMute: unknown) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { contributorId: true, mediaType: true } });
  if (!angle) throw new SoundError("not_found");
  if (angle.contributorId !== user.id) throw new SoundError("forbidden");
  const sound = rawKey === null ? null : soundByKey(typeof rawKey === "string" ? rawKey : null);
  if (rawKey !== null && !sound) throw new SoundError("invalid");
  const muteOriginal = angle.mediaType === "VIDEO" && !!sound && (isSolemn(sound) || rawMute === true);
  await db.angle.update({ where: { id: angleId }, data: { soundKey: sound?.key ?? null, muteOriginal } });
  return { soundKey: sound?.key ?? null, muteOriginal };
}

const live = () => ({ status: "READY" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

// How many shots and montages use a sound (all of them, private ones included — only
// the number is shown).
export async function soundUses(key: string) {
  const [angles, montages] = await Promise.all([
    db.angle.count({ where: { soundKey: key, ...live() } }),
    db.montage.count({ where: { soundKey: key, status: "READY" } }),
  ]);
  return angles + montages;
}

// A sound's page: its public shots (checked, from public moments, not from people the
// viewer blocked), newest first.
export async function soundShots(viewer: User | null, key: string, take = 30) {
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const angles = await db.angle.findMany({
    where: {
      soundKey: key,
      ...live(),
      screening: "allowed",
      contributorId: { notIn: blocked },
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" } },
    },
    orderBy: { uploadedAt: "desc" },
    take,
    include: { moment: { select: { code: true } } },
  });
  return Promise.all(
    angles.map(async (a) => ({
      id: a.id,
      mediaType: a.mediaType,
      momentCode: a.moment.code,
      coverUrl: await viewUrl(a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath),
    })),
  );
}

// ── The shot's look (filter and date stamp) ─────────────────────────────────

export async function setAngleLook(user: User, angleId: string, rawFilter: unknown, rawStamp: unknown) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { contributorId: true } });
  if (!angle) throw new SoundError("not_found");
  if (angle.contributorId !== user.id) throw new SoundError("forbidden");
  const filter = rawFilter === null ? null : filterByKey(typeof rawFilter === "string" ? rawFilter : null);
  if (rawFilter !== null && !filter) throw new SoundError("invalid");
  if (typeof rawStamp !== "boolean") throw new SoundError("invalid");
  await db.angle.update({ where: { id: angleId }, data: { filter: filter?.key ?? null, stamp: rawStamp } });
  return { filter: filter?.key ?? null, stamp: rawStamp };
}
