import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { EVENT_SCENES, matchable, SKY_SCENES, type Scene } from "@/lib/scenes";
import { coverOf } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { newCode } from "@/server/moments";
import { notify } from "@/server/notifications";
import { placeViews } from "@/server/places";

// «صوّر معك»: right after a shot is checked, look for a PUBLIC moment where someone else shot
// the same scene, near the same place, at nearly the same time — and offer to add the shot to
// it. The shot joins directly; the moment's host is told warmly and can give it back («شيلها»).
// Hosts who turned off «اسمح للي صوّروا نفس اللحظة ينضمّوا» are never suggested.

// How far «the same moment» reaches depends on what it is: one sunset is seen from a whole
// region, a wedding happens in one place.
export const reachKm = (scene: Scene) => (SKY_SCENES.includes(scene) ? 40 : EVENT_SCENES.includes(scene) ? 5 : 15);
const WINDOW_MS = 3 * 60 * 60 * 1000;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))) * 111.2;
}

export type JoinSuggestion = {
  momentCode: string;
  title: string;
  hostName: string;
  scene: Scene;
  placeName: string | null;
  angleCount: number;
  coverUrl: string | null;
};

// The public moments this shot could join, best first (most angles, then most recent).
async function candidates(userId: string, angleId: string) {
  const angle = await db.angle.findUnique({
    where: { id: angleId },
    include: { place: true, contributor: { select: { isGuest: true } }, moment: { select: { id: true, kind: true } } },
  });
  // Only an official account's checked shot with a clear scene and a place, outside «لحظة اليوم».
  if (!angle || angle.contributorId !== userId || angle.contributor.isGuest) return null;
  if (angle.status !== "READY" || angle.screening !== "allowed" || !matchable(angle.scene) || !angle.place) return null;
  if (angle.moment.kind === "DAILY") return null;
  const scene = angle.scene;
  const at = (angle.capturedAt ?? angle.uploadedAt).getTime();
  const blocked = [...(await blockedIdsFor(userId))];

  const nearby = await db.angle.findMany({
    where: {
      scene,
      status: "READY",
      screening: "allowed",
      contributorId: { notIn: [userId, ...blocked] },
      momentId: { not: angle.momentId },
      OR: [
        { capturedAt: { gte: new Date(at - WINDOW_MS), lte: new Date(at + WINDOW_MS) } },
        { capturedAt: null, uploadedAt: { gte: new Date(at - WINDOW_MS), lte: new Date(at + WINDOW_MS) } },
      ],
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, creator: { allowJoins: true, id: { notIn: blocked } } },
      placeId: { not: null },
    },
    include: { place: { select: { lat: true, lng: true } } },
    take: 300,
  });
  const reach = reachKm(scene);
  const momentIds = [...new Set(nearby.filter((a) => a.place && km(a.place, angle.place!) <= reach).map((a) => a.momentId))];
  if (!momentIds.length) return { angle, scene, moments: [] };
  // Not a moment the person already has a shot in.
  const mine = new Set((await db.angle.findMany({ where: { momentId: { in: momentIds }, contributorId: userId }, select: { momentId: true } })).map((a) => a.momentId));
  const moments = await db.moment.findMany({
    where: { id: { in: momentIds.filter((id) => !mine.has(id)) } },
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { angles: { where: { status: "READY" } } } },
      angles: { where: { status: "READY", screening: "allowed" }, orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], take: 1 },
    },
  });
  moments.sort((a, b) => b._count.angles - a._count.angles || b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  return { angle, scene, moments };
}

export async function findJoinSuggestion(userId: string, angleId: string): Promise<JoinSuggestion | null> {
  try {
    const found = await candidates(userId, angleId);
    const best = found?.moments[0];
    if (!found || !best) return null;
    const place = best.placeId ? (await placeViews([best.placeId])).get(best.placeId) : null;
    return {
      momentCode: best.code,
      title: best.title,
      hostName: best.creator.displayName,
      scene: found.scene,
      placeName: place?.name ?? best.placeName,
      angleCount: best._count.angles,
      coverUrl: best.angles[0] ? await coverOf(best.angles[0]) : null,
    };
  } catch (error) {
    // A suggestion must never break an upload.
    console.error("join suggestion failed", angleId, error);
    return null;
  }
}

export class JoinError extends Error {
  constructor(public code: "not_found" | "not_suggested" | "forbidden") {
    super(code);
  }
}

// The shot's owner accepted: the shot moves into that moment (it becomes public there). Its
// old moment goes away if it's now empty and was the owner's own; the host is told.
export async function joinMoment(userId: string, angleId: string, code: string) {
  const found = await candidates(userId, angleId);
  if (!found) throw new JoinError("not_found");
  const target = found.moments.find((m) => m.code === code.toUpperCase());
  if (!target) throw new JoinError("not_suggested"); // re-checked: no joining just any moment
  const source = await db.moment.findUniqueOrThrow({ where: { id: found.angle.momentId } });

  await db.$transaction(async (tx) => {
    // Montages of the old moment that include this shot are out of date.
    await tx.montage.deleteMany({ where: { momentId: source.id, angleIds: { has: angleId } } });
    await tx.angle.update({
      where: { id: angleId },
      data: {
        momentId: target.id,
        expiresAt: null,
        joinedFrom: { momentId: source.id, title: source.title, visibility: source.visibility, placeId: source.placeId },
      },
    });
    await tx.participant.upsert({
      where: { momentId_userId: { momentId: target.id, userId } },
      create: { momentId: target.id, userId, role: "CONTRIBUTOR" },
      update: {},
    });
    await tx.moment.update({ where: { id: target.id }, data: { lastActivityAt: new Date() } });
  });
  // The owner's own moment, now empty, isn't needed any more (kept if anything refers to it).
  if (source.creatorId === userId && (await db.angle.count({ where: { momentId: source.id } })) === 0) {
    await db.moment.delete({ where: { id: source.id } }).catch(() => {});
  }
  await notify({ userId: target.creatorId, actorId: userId, kind: "JOINED", angleId });
  return { code: target.code };
}

// The host's «شيلها»: the shot leaves their moment and gets its own moment back (the same one
// if it still exists, else a new one like it). Nothing is deleted; the owner keeps their shot.
export async function giveBack(hostId: string, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { id: true, creatorId: true } } } });
  const from = angle?.joinedFrom as { momentId?: string; title?: string; visibility?: string; placeId?: string | null } | null;
  if (!angle || !from || angle.moment.creatorId !== hostId) throw new JoinError("forbidden");

  const old = from.momentId ? await db.moment.findUnique({ where: { id: from.momentId } }) : null;
  const home =
    old && old.creatorId === angle.contributorId
      ? old
      : await db.moment.create({
          data: {
            code: await freeCode(),
            title: (from.title ?? "لحظتي").slice(0, 80),
            visibility: from.visibility === "PUBLIC" || from.visibility === "LINK" ? from.visibility : "FRIENDS",
            placeId: from.placeId ?? null,
            creatorId: angle.contributorId,
            participants: { create: { userId: angle.contributorId, role: "HOST" } },
          },
        });
  await db.$transaction([
    db.montage.deleteMany({ where: { momentId: angle.momentId, angleIds: { has: angleId } } }),
    db.angle.update({ where: { id: angleId }, data: { momentId: home.id, joinedFrom: Prisma.DbNull } }),
    db.notification.deleteMany({ where: { angleId, kind: "JOINED" } }),
  ]);
  return { code: home.code };
}

async function freeCode() {
  for (;;) {
    const code = newCode();
    if (!(await db.moment.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
}
