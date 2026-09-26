import { randomInt } from "node:crypto";
import { Visibility } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeWhyNowScore } from "@/lib/movaEngine";
import { viewUrl } from "@/server/media";
import { commentCounts } from "@/server/comments";
import { viewCounts } from "@/server/profile";
import { reactionsFor, savedFor } from "@/server/reactions";
import { screenText } from "@/server/screening";
import { isNew } from "@/lib/site";

// No 0/O, 1/I/L: codes get read aloud and typed from screenshots.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export class MomentError extends Error {
  constructor(public code: "invalid_title" | "invalid_place" | "not_found" | "code_exhausted" | "official_required" | "forbidden" | "invalid" | "invalid_description" | "description_blocked") {
    super(code);
  }
}

export const DESCRIPTION_MAX = 150;

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
  description?: unknown;
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
  const description = input.description == null || input.description === "" ? null : clean(input.description, DESCRIPTION_MAX);
  if (input.description && !description) throw new MomentError("invalid_description");
  const visibility = Object.values(Visibility).includes(input.visibility as Visibility)
    ? (input.visibility as Visibility)
    : Visibility.FRIENDS;
  // «للكل» is for official (Google) accounts only.
  if (visibility === Visibility.PUBLIC && creator.isGuest) throw new MomentError("official_required");
  // Everyone reads a public description: it must pass the check first (fail-closed).
  if (visibility === Visibility.PUBLIC && description && (await screenText(description)).result !== "allowed") throw new MomentError("description_blocked");

  // Users only create everyday moments; BIG and DAILY moments are scheduled by Zawmo.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await db.moment.findUnique({ where: { code }, select: { id: true } })) continue;
    return db.moment.create({
      data: {
        code,
        title,
        description,
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
      include: { contributor: { select: { displayName: true, isGuest: true, avatarUrl: true } } },
      orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    }),
    db.participant.count({ where: { momentId: moment.id } }),
    db.user.findUnique({ where: { id: moment.creatorId }, select: { displayName: true } }),
  ]);

  const isCreator = viewer?.id === moment.creatorId;
  const hasContributed = !!viewer && angles.some((a) => a.contributorId === viewer.id);
  // Public moments are open to everyone; "give to get" is for friends/link moments —
  // and for «لحظة اليوم», where seeing everyone's angle is the reward for adding yours.
  const unlocked = isCreator || hasContributed || (moment.visibility === Visibility.PUBLIC && moment.kind !== "DAILY");
  const visible = unlocked ? angles : angles.slice(0, 1);
  const visibleIds = visible.map((a) => a.id);
  // Views and likes are shown to everyone.
  const contributorIds = [...new Set(visible.map((a) => a.contributorId))];
  const [reactions, comments, views, saved, follows] = await Promise.all([
    reactionsFor(visibleIds, viewer),
    commentCounts(visibleIds),
    viewCounts(visibleIds),
    savedFor(visibleIds, viewer),
    viewer ? db.follow.findMany({ where: { followerId: viewer.id, followingId: { in: contributorIds } }, select: { followingId: true } }) : [],
  ]);
  const following = new Set(follows.map((f) => f.followingId));

  return {
    id: moment.id,
    code: moment.code,
    title: moment.title,
    description: moment.description,
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
    angles: await Promise.all(
      visible.map(async (a) => ({
        id: a.id,
        mediaType: a.mediaType,
        presence: a.presence,
        soundKey: a.soundKey,
        muteOriginal: a.muteOriginal,
        filter: a.filter,
        stamp: a.stamp,
        takenAt: a.capturedAt ?? a.uploadedAt,
        contributorName: a.contributor.displayName,
        contributorAvatar: a.contributor.avatarUrl,
        // Official accounts have a profile page; guests don't.
        profileId: a.contributor.isGuest ? null : a.contributorId,
        capturedAt: a.capturedAt,
        uploadedAt: a.uploadedAt,
        isNew: isNew(a.uploadedAt, now),
        durationSec: a.durationSec,
        width: a.width,
        height: a.height,
        mediaUrl: await viewUrl(a.mediaPath),
        thumbUrl: await viewUrl(a.thumbPath),
        likes: reactions.get(a.id)!,
        saved: saved.has(a.id),
        // Follow straight from the viewer (official accounts, not yourself).
        following: following.has(a.contributorId),
        commentCount: comments.get(a.id) ?? 0,
        canDelete: !!viewer && (a.contributorId === viewer.id || isCreator),
        isMine: !!viewer && a.contributorId === viewer.id,
        views: views.get(a.id) ?? 0,
      })),
    ),
  };
}

// "My moments": everything the user created or took part in, most recently active first.
// The cover is the moment's first angle — the one every link holder may already see.
export async function listMyMoments(user: User, limit = 20) {
  const now = new Date();
  const moments = await db.moment.findMany({
    where: {
      participants: { some: { userId: user.id } },
      OR: [{ status: "ACTIVE" }, { creatorId: user.id }],
    },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    include: {
      _count: { select: { participants: true } },
      angles: {
        where: { status: "READY", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
        select: { mediaType: true, mediaPath: true, thumbPath: true },
      },
    },
  });

  return Promise.all(
    moments.map(async (m) => {
      const cover = m.angles[0];
      return {
        code: m.code,
        title: m.title,
        placeName: m.placeName,
        lastActivityAt: m.lastActivityAt,
        isCreator: m.creatorId === user.id,
        angleCount: m.angles.length,
        participantCount: m._count.participants,
        coverUrl: cover ? await viewUrl(cover.mediaType === "VIDEO" ? cover.thumbPath : cover.mediaPath) : null,
      };
    }),
  );
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

// The creator changes who can see their moment. «للكل» needs an official account.
// Returns the moment so the caller can check older angles before they go public.
export async function setMomentVisibility(user: User, code: string, raw: unknown) {
  const visibility = Object.values(Visibility).includes(raw as Visibility) ? (raw as Visibility) : null;
  if (!visibility) throw new MomentError("invalid");
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment) throw new MomentError("not_found");
  if (moment.creatorId !== user.id) throw new MomentError("forbidden");
  if (visibility === Visibility.PUBLIC && user.isGuest) throw new MomentError("official_required");
  return db.moment.update({ where: { id: moment.id }, data: { visibility } });
}

// «لحظة اليوم» is started by the Zawmo system account: public, kind DAILY.
export async function createDailyMoment(system: User, title: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await db.moment.findUnique({ where: { code }, select: { id: true } })) continue;
    return db.moment.create({
      data: {
        code,
        title: title.slice(0, 80),
        kind: "DAILY",
        visibility: Visibility.PUBLIC,
        creatorId: system.id,
        participants: { create: { userId: system.id, role: "HOST" } },
      },
    });
  }
  throw new MomentError("code_exhausted");
}
