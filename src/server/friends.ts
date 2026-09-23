import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";

// "Friends" on MOVA are people you have already shared a moment with. No phone
// numbers or address books: the relationship comes from moments you were both part of.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INVITES_PER_REQUEST = 20;

export class FriendError extends Error {
  constructor(public code: "not_found" | "forbidden") {
    super(code);
  }
}

// People who shared a moment with the user, most recent shared moment first — minus
// anyone either of them blocked (so blocks also cover suggestions, invites and the
// "from your friends" list).
export async function friendsOf(user: User, limit = 50) {
  const blocked = await blockedIdsFor(user.id);
  const rows = await db.participant.findMany({
    where: { userId: { not: user.id }, moment: { participants: { some: { userId: user.id } } } },
    include: { user: { select: { id: true, displayName: true } }, moment: { select: { lastActivityAt: true } } },
    orderBy: { moment: { lastActivityAt: "desc" } },
    take: 500,
  });
  const seen = new Map<string, { id: string; displayName: string }>();
  for (const r of rows) if (!seen.has(r.user.id) && !blocked.has(r.user.id)) seen.set(r.user.id, r.user);
  return [...seen.values()].slice(0, limit);
}

// Friends worth suggesting for one moment: those not already in it.
export async function friendsToInvite(user: User, code: string, limit = 5) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() }, include: { participants: { select: { userId: true } } } });
  if (!moment) throw new FriendError("not_found");
  const inside = new Set(moment.participants.map((p) => p.userId));
  return (await friendsOf(user)).filter((f) => !inside.has(f.id)).slice(0, limit);
}

// "Send this moment to friends": only a participant may send, only to real friends,
// and each person at most once per moment from the same sender.
export async function inviteFriends(user: User, code: string, userIds: unknown) {
  if (!Array.isArray(userIds)) throw new FriendError("forbidden");
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment || moment.status === "HIDDEN") throw new FriendError("not_found");
  const isParticipant = await db.participant.count({ where: { momentId: moment.id, userId: user.id } });
  if (!isParticipant) throw new FriendError("forbidden");

  const friendIds = new Set((await friendsOf(user, 500)).map((f) => f.id));
  const targets = [...new Set(userIds.filter((id): id is string => typeof id === "string"))]
    .filter((id) => friendIds.has(id))
    .slice(0, MAX_INVITES_PER_REQUEST);
  if (!targets.length) return { sent: 0 };

  const result = await db.momentInvite.createMany({
    data: targets.map((toUserId) => ({ momentId: moment.id, fromUserId: user.id, toUserId })),
    skipDuplicates: true,
  });
  return { sent: result.count };
}

type ActivityItem = {
  code: string;
  title: string;
  fromName: string;
  reason: "invite" | "friend";
  at: Date;
  angleCount: number;
  coverUrl: string | null;
};

// The home page's "from your friends" list, last 24 hours:
// - moments a friend sent you ("X sent you a moment");
// - new friends-only or public moments a friend started that you are not in yet.
// Link-only moments are never surfaced here: they stay with whoever holds the link.
export async function friendsActivity(user: User, limit = 10): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - DAY_MS);
  const now = new Date();
  const liveAngles = { where: { status: "READY" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } };
  const firstAngle = { ...liveAngles, orderBy: [{ capturedAt: "asc" as const }, { uploadedAt: "asc" as const }], select: { mediaType: true, mediaPath: true, thumbPath: true } };

  const blocked = [...(await blockedIdsFor(user.id))];
  const [invites, friendIds] = await Promise.all([
    db.momentInvite.findMany({
      where: { toUserId: user.id, fromUserId: { notIn: blocked }, createdAt: { gt: since }, moment: { status: "ACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { fromUser: { select: { displayName: true } }, moment: { include: { angles: firstAngle, participants: { where: { userId: user.id }, select: { userId: true } } } } },
    }),
    friendsOf(user, 500).then((f) => f.map((x) => x.id)),
  ]);

  const started = friendIds.length
    ? await db.moment.findMany({
        where: {
          creatorId: { in: friendIds },
          createdAt: { gt: since },
          status: "ACTIVE",
          visibility: { in: ["FRIENDS", "PUBLIC"] },
          participants: { none: { userId: user.id } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { creator: { select: { displayName: true } }, angles: firstAngle },
      })
    : [];

  type Source = { code: string; title: string; angles: { mediaType: string; mediaPath: string | null; thumbPath: string | null }[] };
  const cover = async (m: Source) => {
    const a = m.angles[0];
    return a ? viewUrl(a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath) : null;
  };

  const items = new Map<string, ActivityItem>();
  for (const inv of invites) {
    // Already took part (added an angle or joined): nothing left to invite them to.
    if (inv.moment.participants.length || items.has(inv.moment.code)) continue;
    items.set(inv.moment.code, {
      code: inv.moment.code,
      title: inv.moment.title,
      fromName: inv.fromUser.displayName,
      reason: "invite",
      at: inv.createdAt,
      angleCount: inv.moment.angles.length,
      coverUrl: await cover(inv.moment),
    });
  }
  for (const m of started) {
    if (items.has(m.code)) continue;
    items.set(m.code, {
      code: m.code,
      title: m.title,
      fromName: m.creator.displayName,
      reason: "friend",
      at: m.createdAt,
      angleCount: m.angles.length,
      coverUrl: await cover(m),
    });
  }
  return [...items.values()].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
