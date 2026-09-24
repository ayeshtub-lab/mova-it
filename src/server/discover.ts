import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeWhyNowScore } from "@/lib/movaEngine";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";

// «اكتشف»: public moments for signed-in official accounts. Vertical = moments,
// horizontal = their angles. Only angles that passed the automatic check (or an
// admin) appear, and nothing from people the viewer blocked or who blocked them.

const CANDIDATES = 60;
const PAGE = 20;
const ANGLES_PER_MOMENT = 12;

export async function listDiscover(viewer: User) {
  const now = new Date();
  const blocked = [...(await blockedIdsFor(viewer.id))];
  const shown = {
    status: "READY" as const,
    screening: "allowed",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    contributorId: { notIn: blocked },
  };

  const moments = await db.moment.findMany({
    where: { visibility: "PUBLIC", status: "ACTIVE", creatorId: { notIn: blocked }, angles: { some: shown } },
    orderBy: { lastActivityAt: "desc" },
    take: CANDIDATES,
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { participants: true } },
      angles: {
        where: shown,
        orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
        take: ANGLES_PER_MOMENT,
        include: { contributor: { select: { id: true, displayName: true, avatarUrl: true, isGuest: true } } },
      },
    },
  });

  const ranked = moments
    .map((m) => ({ m, score: computeWhyNowScore(m.lastActivityAt, m.angles.length, m._count.participants) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PAGE)
    .map((x) => x.m);

  return Promise.all(
    ranked.map(async (m) => ({
      code: m.code,
      title: m.title,
      placeName: m.placeName,
      creatorName: m.creator.displayName,
      people: m._count.participants,
      lastActivityAt: m.lastActivityAt,
      angles: await Promise.all(
        m.angles.map(async (a) => ({
          id: a.id,
          mediaType: a.mediaType,
          mediaUrl: await viewUrl(a.mediaPath),
          posterUrl: await viewUrl(a.thumbPath),
          name: a.contributor.displayName,
          avatarUrl: a.contributor.avatarUrl,
          profileId: a.contributor.isGuest ? null : a.contributor.id,
        })),
      ),
    })),
  );
}
