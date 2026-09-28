import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { EVENT_SCENES, matchable, SKY_SCENES, type Scene } from "@/lib/scenes";
import { coverOf } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { newCode } from "@/server/moments";
import { notify } from "@/server/notifications";
import { placeViews } from "@/server/places";
import placesData from "@/data/places.json";
import { normalize } from "@/lib/arabic";

// «صوّر معك»: right after a shot is checked, look for a PUBLIC moment where someone else shot
// the same scene, near the same place, at nearly the same time — and offer to add the shot to
// it. The shot joins directly; the moment's host is told warmly and can give it back («شيلها»).
// Hosts who turned off «اسمح للي صوّروا نفس اللحظة ينضمّوا» are never suggested.

// How far «the same moment» reaches depends on what it is: one sunset is seen from a whole
// region, a wedding happens in one place.
export const reachKm = (scene: Scene | null) => (scene && SKY_SCENES.includes(scene) ? 40 : scene && EVENT_SCENES.includes(scene) ? 5 : 15);
const WINDOW_MS = 6 * 60 * 60 * 1000; // a named moment («كلير», «عرس أحمد») can last an evening
const SCENE_WINDOW_MS = 3 * 60 * 60 * 1000; // «the same sunset» is a matter of hours

// Place centres from the bundled list (no database trip): precise places and network towns.
const centre = new Map(
  (placesData as unknown as { places: { id: string; lat?: number; lng?: number }[] }).places
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => [p.id, { lat: p.lat!, lng: p.lng! }]),
);
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))) * 111.2;
}
const words = (s: string | null | undefined) => new Set((s ?? "").split(/[\s·,،.\-–—/|]+/).map(normalize).filter((w) => w.length >= 3));

// How strongly two shots look like the same moment. Content says WHAT (the moment's name,
// what the lens read, the scene); place says WHERE. A suggestion needs the same scene nearby,
// or strong content (a shared name or sign) that is either nearby or backed by more content.
export function matchScore(
  me: { title: string; seen: string | null; scene: string | null; at: number; precise: string | null; network: string | null },
  them: { title: string; seen: (string | null)[]; scenes: { scene: string | null; at: number }[]; precise: (string | null)[]; network: (string | null)[] },
) {
  let content = 0;
  const [a, b] = [normalize(me.title), normalize(them.title)];
  if (a.length >= 2 && a === b) content += 5;
  else if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) content += 4;
  else {
    const [wa, wb] = [words(me.title), words(them.title)];
    const shared = [...wa].filter((w) => wb.has(w)).length;
    if (shared && shared / Math.max(1, Math.min(wa.size, wb.size)) >= 0.5) content += 3;
  }
  const mine = words(me.seen);
  if (mine.size && them.seen.some((t) => [...words(t)].some((w) => mine.has(w)))) content += 4;
  const sameScene = matchable(me.scene) && them.scenes.some((s) => s.scene === me.scene && Math.abs(s.at - me.at) <= SCENE_WINDOW_MS);
  if (sameScene) content += 2;

  const reach = reachKm(matchable(me.scene) ? me.scene : null);
  const dist = (x: string | null, y: string | null) => (x && y && centre.has(x) && centre.has(y) ? km(centre.get(x)!, centre.get(y)!) : null);
  // Both places known for sure and far apart: not the same moment, whatever the name says.
  const preciseDistances = them.precise.map((p) => dist(me.precise, p)).filter((d): d is number => d != null);
  if (preciseDistances.length && Math.min(...preciseDistances) > 2 * reach) return 0;
  const near = [me.precise, me.network].some((x) => [...them.precise, ...them.network].some((y) => {
    const d = dist(x, y);
    return d != null && d <= reach;
  }));
  // The same scene close by and close in time is itself the same moment (one sunset, one match).
  const ok = (content >= 4 && (near || content >= 7)) || (sameScene && near);
  return ok ? content + (near ? 2 : 0) : 0;
}

// The public moments this shot could join, best first.
async function candidates(userId: string, angleId: string) {
  const angle = await db.angle.findUnique({
    where: { id: angleId },
    include: { contributor: { select: { isGuest: true } }, moment: { select: { id: true, kind: true, title: true, placeId: true } } },
  });
  // Only an official account's checked shot, outside «لحظة اليوم».
  if (!angle || angle.contributorId !== userId || angle.contributor.isGuest) return null;
  if (angle.status !== "READY" || angle.screening !== "allowed" || angle.moment.kind === "DAILY") return null;
  const at = (angle.capturedAt ?? angle.uploadedAt).getTime();
  const blocked = [...(await blockedIdsFor(userId))];

  const recent = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      contributorId: { notIn: [userId, ...blocked] },
      momentId: { not: angle.momentId },
      OR: [
        { capturedAt: { gte: new Date(at - WINDOW_MS), lte: new Date(at + WINDOW_MS) } },
        { capturedAt: null, uploadedAt: { gte: new Date(at - WINDOW_MS), lte: new Date(at + WINDOW_MS) } },
      ],
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, creator: { allowJoins: true, id: { notIn: blocked } } },
    },
    select: { momentId: true, scene: true, seenText: true, placeId: true, networkPlaceId: true, capturedAt: true, uploadedAt: true, moment: { select: { title: true, placeId: true } } },
    take: 500,
  });
  const byMoment = new Map<string, typeof recent>();
  for (const a of recent) byMoment.set(a.momentId, [...(byMoment.get(a.momentId) ?? []), a]);
  // Not a moment the person already has a shot in.
  const already = new Set(
    (await db.angle.findMany({ where: { momentId: { in: [...byMoment.keys()] }, contributorId: userId }, select: { momentId: true } })).map((a) => a.momentId),
  );
  const me = { title: angle.moment.title, seen: angle.seenText, scene: angle.scene, at, precise: angle.placeId ?? angle.moment.placeId, network: angle.networkPlaceId };
  const scored = [...byMoment.entries()]
    .filter(([id]) => !already.has(id))
    .map(([id, shots]) => ({
      id,
      score: matchScore(me, {
        title: shots[0].moment.title,
        seen: shots.map((s) => s.seenText),
        scenes: shots.map((s) => ({ scene: s.scene, at: (s.capturedAt ?? s.uploadedAt).getTime() })),
        precise: [...shots.map((s) => s.placeId), shots[0].moment.placeId],
        network: shots.map((s) => s.networkPlaceId),
      }),
    }))
    .filter((x) => x.score > 0);
  if (!scored.length) return { angle, moments: [] };
  const score = new Map(scored.map((x) => [x.id, x.score]));
  const moments = await db.moment.findMany({
    where: { id: { in: [...score.keys()] } },
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { angles: { where: { status: "READY" } } } },
      angles: { where: { status: "READY", screening: "allowed" }, orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], take: 1 },
    },
  });
  moments.sort((a, b) => score.get(b.id)! - score.get(a.id)! || b._count.angles - a._count.angles || b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  return { angle, moments };
}

export type JoinSuggestion = {
  momentCode: string;
  title: string;
  hostName: string;
  scene: Scene | null; // the shared scene, when that's part of why
  placeName: string | null;
  angleCount: number;
  coverUrl: string | null;
};

export async function findJoinSuggestion(userId: string, angleId: string): Promise<JoinSuggestion | null> {
  try {
    const found = await candidates(userId, angleId);
    const best = found?.moments[0];
    if (!found || !best) return null;
    const place = best.placeId ? (await placeViews([best.placeId])).get(best.placeId) : null;
    const scene = found.angle.scene;
    const sharedScene = matchable(scene) && (await db.angle.count({ where: { momentId: best.id, scene } })) > 0 ? scene : null;
    return {
      momentCode: best.code,
      title: best.title,
      hostName: best.creator.displayName,
      scene: sharedScene,
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
