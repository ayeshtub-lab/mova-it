import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeWhyNowScore } from "@/lib/movaEngine";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { hashtagsIn, normalizeTag } from "@/lib/hashtags";

// «اكتشف»: public moments — for everyone to watch (visitors too); interacting needs an
// account. Vertical = moments,
// horizontal = their angles. Only angles that passed the automatic check (or an
// admin) appear, and nothing from people the viewer blocked or who blocked them.

const CANDIDATES = 60;
const PAGE = 20;
const ANGLES_PER_MOMENT = 12;

export async function listDiscover(viewer: User | null) {
  const now = new Date();
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const shown = {
    status: "READY" as const,
    screening: "allowed",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    contributorId: { notIn: blocked },
  };

  const moments = await db.moment.findMany({
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      creatorId: { notIn: blocked },
      angles: { some: shown },
    },
    orderBy: { lastActivityAt: "desc" },
    take: CANDIDATES,
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { participants: true } },
      angles: {
        where: shown,
        orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
        take: ANGLES_PER_MOMENT,
        include: {
          contributor: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              isGuest: true,
            },
          },
        },
      },
    },
  });

  // «لحظة اليوم» first, then by "why now".
  const ranked = moments
    .map((m) => ({
      m,
      score:
        m.kind === "DAILY"
          ? Infinity
          : computeWhyNowScore(
              m.lastActivityAt,
              m.angles.length,
              m._count.participants,
            ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PAGE)
    .map((x) => x.m);

  // Give-to-get stays for «لحظة اليوم»: until you add yours, you see one angle.
  const dailyIds = viewer ? ranked.filter((m) => m.kind === "DAILY").map((m) => m.id) : [];
  const joined = new Set(
    dailyIds.length
      ? (
          await db.angle.findMany({
            where: {
              momentId: { in: dailyIds },
              contributorId: viewer!.id,
              status: "READY",
            },
            select: { momentId: true },
          })
        ).map((a) => a.momentId)
      : [],
  );

  return Promise.all(
    ranked.map(async (m) => {
      const locked = m.kind === "DAILY" && !joined.has(m.id);
      const angles = locked ? m.angles.slice(0, 1) : m.angles;
      return {
        code: m.code,
        daily: m.kind === "DAILY",
        lockedCount: m.angles.length - angles.length,
        title: m.title,
        placeName: m.placeName,
        creatorName: m.creator.displayName,
        people: m._count.participants,
        lastActivityAt: m.lastActivityAt,
        angles: await Promise.all(
          angles.map(async (a) => ({
            id: a.id,
            mediaType: a.mediaType,
            mediaUrl: await viewUrl(a.mediaPath),
            posterUrl: await viewUrl(a.thumbPath),
            name: a.contributor.displayName,
            avatarUrl: a.contributor.avatarUrl,
            profileId: a.contributor.isGuest ? null : a.contributor.id,
          })),
        ),
      };
    }),
  );
}

// Public moments whose description carries #tag, newest activity first; cover = the
// first angle that passed the check. Same rules as «اكتشف».
export async function listTag(viewer: User, rawTag: string) {
  const tag = normalizeTag(rawTag);
  if (!/^[\p{L}\p{N}_]{1,40}$/u.test(tag)) return [];
  const now = new Date();
  const blocked = [...(await blockedIdsFor(viewer.id))];
  const shown = { status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], contributorId: { notIn: blocked } };
  const moments = await db.moment.findMany({
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      creatorId: { notIn: blocked },
      description: { contains: `#${tag}`, mode: "insensitive" },
      angles: { some: shown },
    },
    orderBy: { lastActivityAt: "desc" },
    take: CANDIDATES,
    include: { angles: { where: shown, orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], take: 1 }, _count: { select: { angles: { where: shown } } } },
  });
  // "contains" also matches #tagger for #tag: keep exact tags only.
  return Promise.all(
    moments
      .filter((m) => hashtagsIn(m.description).includes(tag))
      .map(async (m) => {
        const a = m.angles[0];
        return {
          code: m.code,
          title: m.title,
          angleCount: m._count.angles,
          coverUrl: a ? await viewUrl(a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath) : null,
        };
      }),
  );
}

// The visitor's home page: recent public shots that passed the check (not «لحظة اليوم»,
// which is give-to-get), videos first so they lead the grid.
export async function publicShowcase(take = 12) {
  const angles = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" } },
    },
    orderBy: { uploadedAt: "desc" },
    take: 40,
    include: { moment: { select: { code: true, title: true } }, contributor: { select: { displayName: true } } },
  });
  const picked = [...angles.filter((a) => a.mediaType === "VIDEO").slice(0, 4), ...angles.filter((a) => a.mediaType === "PHOTO")].slice(0, take);
  return Promise.all(
    picked.map(async (a) => ({
      id: a.id,
      video: a.mediaType === "VIDEO",
      mediaUrl: a.mediaType === "VIDEO" ? await viewUrl(a.mediaPath) : null,
      imageUrl: await viewUrl(a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath),
      momentCode: a.moment.code,
      title: a.moment.title,
      name: a.contributor.displayName,
    })),
  );
}
