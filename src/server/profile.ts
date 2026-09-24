import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanDisplayName } from "@/lib/session";
import { visibleAngle } from "@/server/access";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";

// Profiles (official accounts only). What a visitor sees follows the same rules as
// everywhere else:
// - "link only" moments never show on a profile, except to people already in them;
// - "friends" moments show to friends (people who shared a moment) and participants;
// - "give to get": in a friends/link moment you haven't added to, only its first angle
//   is visible (public moments are open).
// Likes and view counts are private to the profile's owner.

const SHOTS = 60;

export class ProfileError extends Error {
  constructor(public code: "not_found" | "invalid" | "forbidden") {
    super(code);
  }
}

const live = () => ({ status: "READY" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });
const cover = (a: { mediaType: string; mediaPath: string | null; thumbPath: string | null }) =>
  viewUrl(a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath);

type MomentLite = { id: string; visibility: string; creatorId: string };

// Everything needed to decide, for one viewer, which of the owner's moments and
// angles are visible — in four queries, however many moments there are.
async function visibilityFor(viewer: User | null, owner: User, moments: MomentLite[]) {
  const ids = [...new Set(moments.map((m) => m.id))];
  if (viewer?.id === owner.id) return { moment: () => true, angle: () => true };

  const [mine, contributed, firsts, friend] = await Promise.all([
    viewer ? db.participant.findMany({ where: { userId: viewer.id, momentId: { in: ids } }, select: { momentId: true } }) : [],
    viewer
      ? db.angle.findMany({ where: { contributorId: viewer.id, momentId: { in: ids }, ...live() }, select: { momentId: true }, distinct: ["momentId"] })
      : [],
    db.angle.findMany({
      where: { momentId: { in: ids }, ...live() },
      orderBy: [{ momentId: "asc" }, { capturedAt: "asc" }, { uploadedAt: "asc" }],
      distinct: ["momentId"],
      select: { id: true },
    }),
    viewer
      ? db.participant
          .count({ where: { userId: viewer.id, moment: { participants: { some: { userId: owner.id } } } } })
          .then((n) => n > 0)
      : false,
  ]);
  const inMoment = new Set(mine.map((p) => p.momentId));
  const unlocked = new Set(contributed.map((a) => a.momentId));
  const firstIds = new Set(firsts.map((a) => a.id));

  const moment = (m: MomentLite) =>
    m.visibility === "PUBLIC" || inMoment.has(m.id) || (m.visibility === "FRIENDS" && friend);
  const angle = (a: { id: string; moment: MomentLite }) =>
    moment(a.moment) && (a.moment.visibility === "PUBLIC" || a.moment.creatorId === viewer?.id || unlocked.has(a.moment.id) || firstIds.has(a.id));
  return { moment, angle };
}

export async function getProfile(viewer: User | null, userId: string) {
  const owner = await db.user.findUnique({ where: { id: userId } });
  if (!owner || owner.isGuest) return null;
  if (viewer && viewer.id !== owner.id && (await blockedIdsFor(viewer.id)).has(owner.id)) return null;
  const isMe = viewer?.id === owner.id;

  const [followers, following, isFollowing, angles, participations] = await Promise.all([
    db.follow.count({ where: { followingId: owner.id } }),
    db.follow.count({ where: { followerId: owner.id } }),
    viewer && !isMe ? db.follow.count({ where: { followerId: viewer.id, followingId: owner.id } }).then((n) => n > 0) : false,
    db.angle.findMany({
      where: { contributorId: owner.id, ...live(), moment: { status: "ACTIVE" } },
      orderBy: { uploadedAt: "desc" },
      take: SHOTS,
      include: { moment: { select: { id: true, code: true, title: true, visibility: true, creatorId: true } } },
    }),
    db.participant.findMany({
      where: { userId: owner.id, moment: { status: "ACTIVE" } },
      orderBy: { moment: { lastActivityAt: "desc" } },
      take: 40,
      include: {
        moment: {
          select: {
            id: true,
            code: true,
            title: true,
            visibility: true,
            creatorId: true,
            lastActivityAt: true,
            angles: { where: live(), orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], select: { mediaType: true, mediaPath: true, thumbPath: true } },
          },
        },
      },
    }),
  ]);

  const can = await visibilityFor(viewer, owner, [...angles.map((a) => a.moment), ...participations.map((p) => p.moment)]);
  const shownAngles = angles.filter((a) => can.angle(a));
  const views = isMe
    ? new Map(
        (await db.angleView.groupBy({ by: ["angleId"], where: { angleId: { in: shownAngles.map((a) => a.id) } }, _count: { _all: true } })).map((g) => [
          g.angleId,
          g._count._all,
        ]),
      )
    : null;

  const shots = await Promise.all(
    shownAngles.map(async (a) => ({
      id: a.id,
      mediaType: a.mediaType,
      coverUrl: await cover(a),
      momentCode: a.moment.code,
      momentTitle: a.moment.title,
      views: views ? (views.get(a.id) ?? 0) : null,
    })),
  );
  const moments = await Promise.all(
    participations
      .filter((p) => can.moment(p.moment))
      .map(async ({ moment: m }) => ({
        code: m.code,
        title: m.title,
        angleCount: m.angles.length,
        lastActivityAt: m.lastActivityAt,
        coverUrl: m.angles[0] ? await cover(m.angles[0]) : null,
      })),
  );

  return {
    id: owner.id,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    isMe,
    isAdmin: isMe && owner.isAdmin,
    googleName: isMe ? owner.googleName : null,
    followers,
    following,
    isFollowing,
    canFollow: !!viewer && !isMe,
    shots,
    moments,
    likes: isMe ? await likedShots(owner) : null,
  };
}

// The owner's own list of what they liked, newest first; only angles still up.
async function likedShots(user: User) {
  const rows = await db.reaction.findMany({
    where: { userId: user.id, angle: { ...live(), moment: { status: "ACTIVE" } } },
    orderBy: { createdAt: "desc" },
    take: SHOTS,
    include: { angle: { include: { moment: { select: { code: true, title: true } } } } },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.angle.id,
      kind: r.kind,
      mediaType: r.angle.mediaType,
      coverUrl: await cover(r.angle),
      momentCode: r.angle.moment.code,
      momentTitle: r.angle.moment.title,
    })),
  );
}

// ── Follow ─────────────────────────────────────────────────────────────────

export async function setFollow(viewer: User, targetId: string, on: boolean) {
  if (targetId === viewer.id) throw new ProfileError("invalid");
  if (!on) {
    await db.follow.deleteMany({ where: { followerId: viewer.id, followingId: targetId } });
    return;
  }
  const target = await db.user.findUnique({ where: { id: targetId }, select: { isGuest: true } });
  if (!target || target.isGuest || (await blockedIdsFor(viewer.id)).has(targetId)) throw new ProfileError("not_found");
  await db.follow.upsert({
    where: { followerId_followingId: { followerId: viewer.id, followingId: targetId } },
    create: { followerId: viewer.id, followingId: targetId },
    update: {},
  });
}

export async function setDisplayName(user: User, raw: unknown) {
  const name = cleanDisplayName(raw);
  if (!name) throw new ProfileError("invalid");
  await db.user.update({ where: { id: user.id }, data: { displayName: name } });
}

// ── Views ──────────────────────────────────────────────────────────────────

// "Seen by": once per person per angle, never your own, only angles you may see.
export async function recordViews(user: User, raw: unknown) {
  if (!Array.isArray(raw)) throw new ProfileError("invalid");
  const ids = [...new Set(raw.filter((x): x is string => typeof x === "string"))].slice(0, 20);
  const seen: string[] = [];
  for (const id of ids) {
    const angle = await visibleAngle(user, id);
    if (angle && angle.contributorId !== user.id) seen.push(id);
  }
  if (seen.length) await db.angleView.createMany({ data: seen.map((angleId) => ({ angleId, userId: user.id })), skipDuplicates: true });
  return { recorded: seen.length };
}

export async function viewCounts(angleIds: string[]) {
  if (!angleIds.length) return new Map<string, number>();
  const groups = await db.angleView.groupBy({ by: ["angleId"], where: { angleId: { in: angleIds } }, _count: { _all: true } });
  return new Map(groups.map((g) => [g.angleId, g._count._all]));
}
