import { randomInt } from "node:crypto";
import { Visibility } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeWhyNowScore } from "@/lib/movaEngine";

// No 0/O, 1/I/L: codes get read aloud and typed from screenshots.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export class MomentError extends Error {
  constructor(public code: "invalid_title" | "invalid_place" | "not_found" | "code_exhausted") {
    super(code);
  }
}

const newCode = () =>
  Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const clean = (value: unknown, max: number) => {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return text.length >= 1 && text.length <= max ? text : null;
};

// ~1 km: enough to group a moment's area, never enough to find a house.
const approx = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

export type CreateMomentInput = {
  title: unknown;
  placeName?: unknown;
  visibility?: unknown;
  lat?: unknown;
  lng?: unknown;
};

export async function createMoment(creator: User, input: CreateMomentInput) {
  const title = clean(input.title, 80);
  if (!title) throw new MomentError("invalid_title");
  const placeName = input.placeName == null || input.placeName === "" ? null : clean(input.placeName, 60);
  if (input.placeName && !placeName) throw new MomentError("invalid_place");
  const visibility = Object.values(Visibility).includes(input.visibility as Visibility)
    ? (input.visibility as Visibility)
    : Visibility.FRIENDS;

  // Users only create everyday moments; BIG and DAILY moments are scheduled by MOVA.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await db.moment.findUnique({ where: { code }, select: { id: true } })) continue;
    return db.moment.create({
      data: {
        code,
        title,
        placeName,
        visibility,
        latApprox: approx(input.lat),
        lngApprox: approx(input.lng),
        creatorId: creator.id,
        participants: { create: { userId: creator.id, role: "HOST" } },
      },
    });
  }
  throw new MomentError("code_exhausted");
}

// Holding the code means you were invited, whatever the visibility; visibility only
// decides who can discover the moment in feeds. Hidden moments stay with their creator.
async function findViewable(code: string, viewer: User | null) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment) return null;
  if (moment.status === "HIDDEN" && moment.creatorId !== viewer?.id) return null;
  return moment;
}

export async function joinMoment(code: string, user: User) {
  const moment = await findViewable(code, user);
  if (!moment) throw new MomentError("not_found");
  await db.participant.upsert({
    where: { momentId_userId: { momentId: moment.id, userId: user.id } },
    create: { momentId: moment.id, userId: user.id, role: "VIEWER" },
    update: {},
  });
  return moment;
}

// "Give to get": until a viewer adds an angle of their own, they see only the first
// angle; the rest come back as a count, with no ids or media for the locked ones.
export async function getMomentView(code: string, viewer: User | null) {
  const moment = await findViewable(code, viewer);
  if (!moment) return null;

  const now = new Date();
  const [angles, participantCount, creator] = await Promise.all([
    db.angle.findMany({
      where: {
        momentId: moment.id,
        status: "READY",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { contributor: { select: { displayName: true } } },
      orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    }),
    db.participant.count({ where: { momentId: moment.id } }),
    db.user.findUnique({ where: { id: moment.creatorId }, select: { displayName: true } }),
  ]);

  const isCreator = viewer?.id === moment.creatorId;
  const hasContributed = !!viewer && angles.some((a) => a.contributorId === viewer.id);
  const unlocked = isCreator || hasContributed;
  const visible = unlocked ? angles : angles.slice(0, 1);

  return {
    code: moment.code,
    title: moment.title,
    kind: moment.kind,
    visibility: moment.visibility,
    placeName: moment.placeName,
    createdAt: moment.createdAt,
    lastActivityAt: moment.lastActivityAt,
    creatorName: creator?.displayName ?? null,
    participantCount,
    angleCount: angles.length,
    lockedCount: angles.length - visible.length,
    viewer: { isCreator, hasContributed },
    angles: visible.map((a) => ({
      id: a.id,
      mediaType: a.mediaType,
      presence: a.presence,
      contributorName: a.contributor.displayName,
      capturedAt: a.capturedAt,
      uploadedAt: a.uploadedAt,
      durationSec: a.durationSec,
      width: a.width,
      height: a.height,
    })),
  };
}

// Candidates: public moments, moments the viewer is part of, and friends-only moments
// by people the viewer follows. Ranked by "why now" (recent activity × richness).
export async function listFeed(viewer: User | null, limit = 20) {
  const or = [{ visibility: Visibility.PUBLIC }] as object[];
  if (viewer) {
    or.push({ participants: { some: { userId: viewer.id } } });
    or.push({ visibility: Visibility.FRIENDS, creator: { followers: { some: { followerId: viewer.id } } } });
  }

  const candidates = await db.moment.findMany({
    where: { status: "ACTIVE", OR: or },
    orderBy: { lastActivityAt: "desc" },
    take: 100,
    include: {
      _count: { select: { participants: true, angles: { where: { status: "READY" } } } },
    },
  });

  return candidates
    .map((m) => ({
      code: m.code,
      title: m.title,
      kind: m.kind,
      placeName: m.placeName,
      lastActivityAt: m.lastActivityAt,
      angleCount: m._count.angles,
      participantCount: m._count.participants,
      score: computeWhyNowScore(m.lastActivityAt, m._count.angles, m._count.participants),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(limit, 1), 50));
}
