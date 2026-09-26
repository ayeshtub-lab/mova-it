import { randomBytes } from "node:crypto";
import { del, put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanDisplayName } from "@/lib/session";
import { isNew } from "@/lib/site";
import { visibleAngle } from "@/server/access";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { askGemini, screeningEnabled } from "@/server/screening";

// Profiles (official accounts only). What a visitor sees follows the same rules as
// everywhere else:
// - "link only" moments never show on a profile, except to people already in them;
// - "friends" moments show to friends (people who shared a moment) and participants;
// - "give to get": in a friends/link moment you haven't added to, only its first angle
//   is visible (public moments are open).
// Counts (views, likes received) are public; what you liked and saved stays yours.

const SHOTS = 60;

export class ProfileError extends Error {
  constructor(public code: "not_found" | "invalid" | "forbidden" | "blocked") {
    super(code);
  }
}

const live = () => ({ status: "READY" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });
const cover = (a: { mediaType: string; mediaPath: string | null; thumbPath: string | null }) =>
  viewUrl(a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath);

type MomentLite = { id: string; visibility: string; creatorId: string; kind: string };

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
    moment(a.moment) &&
    ((a.moment.visibility === "PUBLIC" && a.moment.kind !== "DAILY") || a.moment.creatorId === viewer?.id || unlocked.has(a.moment.id) || firstIds.has(a.id));
  return { moment, angle };
}

export async function getProfile(viewer: User | null, userId: string) {
  const owner = await db.user.findUnique({ where: { id: userId } });
  if (!owner || owner.isGuest) return null;
  if (viewer && viewer.id !== owner.id && (await blockedIdsFor(viewer.id)).has(owner.id)) return null;
  const isMe = viewer?.id === owner.id;

  const [followers, following, isFollowing, likesReceived, angles, participations] = await Promise.all([
    db.follow.count({ where: { followingId: owner.id } }),
    db.follow.count({ where: { followerId: owner.id } }),
    viewer && !isMe ? db.follow.count({ where: { followerId: viewer.id, followingId: owner.id } }).then((n) => n > 0) : false,
    db.reaction.count({ where: { angle: { contributorId: owner.id, status: "READY" } } }),
    db.angle.findMany({
      where: { contributorId: owner.id, ...live(), moment: { status: "ACTIVE" } },
      orderBy: { uploadedAt: "desc" },
      take: SHOTS,
      include: { moment: { select: { id: true, code: true, title: true, visibility: true, creatorId: true, kind: true } } },
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
            kind: true,
            lastActivityAt: true,
            angles: { where: live(), orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], select: { mediaType: true, mediaPath: true, thumbPath: true } },
          },
        },
      },
    }),
  ]);

  const can = await visibilityFor(viewer, owner, [...angles.map((a) => a.moment), ...participations.map((p) => p.moment)]);
  const shownAngles = angles.filter((a) => can.angle(a));
  const views = await viewCounts(shownAngles.map((a) => a.id));

  const shots = await Promise.all(
    shownAngles.map(async (a) => ({
      id: a.id,
      mediaType: a.mediaType,
      coverUrl: await cover(a),
      momentCode: a.moment.code,
      momentTitle: a.moment.title,
      views: views.get(a.id) ?? 0,
      isNew: isNew(a.uploadedAt),
      filter: a.filter,
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
    likesReceived,
    isFollowing,
    canFollow: !!viewer && !isMe,
    shots,
    moments,
    likes: isMe ? await likedShots(owner) : null,
    saved: isMe ? await savedShots(owner) : null,
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
      mediaType: r.angle.mediaType,
      coverUrl: await cover(r.angle),
      momentCode: r.angle.moment.code,
      momentTitle: r.angle.moment.title,
    })),
  );
}

// The owner's «المحفوظات», newest first, still visible to them (an angle can become
// hidden or its moment private after it was saved).
async function savedShots(user: User) {
  const rows = await db.savedAngle.findMany({
    where: { userId: user.id, angle: { ...live(), moment: { status: "ACTIVE" } } },
    orderBy: { createdAt: "desc" },
    take: SHOTS,
    include: { angle: { include: { moment: { select: { code: true, title: true } } } } },
  });
  const visible = await Promise.all(rows.map(async (r) => ((await visibleAngle(user, r.angleId)) ? r : null)));
  return Promise.all(
    visible
      .filter((r) => r !== null)
      .map(async (r) => ({
        id: r.angle.id,
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

// ── Profile photo ──────────────────────────────────────────────────────────

// The browser sends a small square JPEG (it crops and shrinks it first). Everyone can
// see a profile photo, so it must pass the automatic check (fail-closed, like public
// moments). Stored in the private Blob store and served through /api/avatars/….
const AVATAR_MAX_BYTES = 600 * 1024;
export const AVATAR_FILE = /^[a-z0-9]{10,40}-[A-Za-z0-9]{12}\.jpg$/;

export async function setAvatar(user: User, bytes: Buffer) {
  if (user.isGuest) throw new ProfileError("forbidden");
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg || bytes.length > AVATAR_MAX_BYTES) throw new ProfileError("invalid");
  if (screeningEnabled() && (await askGemini([bytes.toString("base64")])).result !== "allowed") throw new ProfileError("blocked");

  const file = `${user.id.toLowerCase()}-${randomBytes(9).toString("base64url").replace(/[-_]/g, "x")}.jpg`;
  await put(`avatars/${file}`, bytes, { access: "private", contentType: "image/jpeg", addRandomSuffix: false });
  const before = user.avatarUrl;
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: `/api/avatars/${file}` } });
  // The previous uploaded photo is not needed any more (a Google photo isn't ours).
  const old = before?.match(/^\/api\/avatars\/(.+)$/)?.[1];
  if (old && AVATAR_FILE.test(old)) await del(`avatars/${old}`).catch(() => {});
  return `/api/avatars/${file}`;
}

// ── Follower lists ─────────────────────────────────────────────────────────

// Who follows `userId`, or whom they follow: newest first, never anyone the viewer
// blocked or who blocked them. Guests appear by name only (they have no page).
export async function listFollows(viewer: User | null, userId: string, kind: "followers" | "following") {
  const owner = await db.user.findUnique({ where: { id: userId } });
  if (!owner || owner.isGuest) return null;
  const blocked = viewer ? await blockedIdsFor(viewer.id) : new Set<string>();
  if (viewer && blocked.has(owner.id)) return null;
  const rows = await db.follow.findMany({
    where: kind === "followers" ? { followingId: owner.id } : { followerId: owner.id },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { follower: true, following: true },
  });
  return {
    owner: { id: owner.id, displayName: owner.displayName },
    people: rows
      .map((r) => (kind === "followers" ? r.follower : r.following))
      .filter((u) => !blocked.has(u.id) && !u.isSystem)
      .map((u) => ({ id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl, hasPage: !u.isGuest })),
  };
}
