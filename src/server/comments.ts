import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { visibleAngle } from "@/server/access";
import { blockedIdsFor } from "@/server/moderation";
import { notify } from "@/server/notifications";

const MAX_LENGTH = 300;
const MAX_PER_HOUR = 40;

export class CommentError extends Error {
  constructor(public code: "not_found" | "invalid" | "too_many") {
    super(code);
  }
}

// Trim, drop control characters (keep line breaks), squeeze blank lines; 1–300 characters.
function cleanBody(raw: unknown) {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 1 && text.length <= MAX_LENGTH ? text : null;
}

type Row = { id: string; body: string; createdAt: Date; userId: string; parentId: string | null; user: { displayName: string; verified: boolean; avatarUrl: string | null } };
const toView = (c: Row, viewer: User | null, creatorId: string, likes = { count: 0, liked: false }) => ({
  id: c.id,
  body: c.body,
  createdAt: c.createdAt,
  authorName: c.user.displayName,
  authorVerified: c.user.verified,
  authorAvatar: c.user.avatarUrl,
  parentId: c.parentId,
  likes: likes.count,
  liked: likes.liked,
  mine: !!viewer && c.userId === viewer.id,
  canDelete: !!viewer && (c.userId === viewer.id || creatorId === viewer.id),
});

// A visitor (no account) may read the comments on a public moment's checked angle.
const publicAngle = (angleId: string) =>
  db.angle.findFirst({
    where: { id: angleId, status: "READY", screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" } } },
    include: { moment: true },
  });

export async function listComments(user: User | null, angleId: string) {
  const angle = user ? await visibleAngle(user, angleId) : await publicAngle(angleId);
  if (!angle) throw new CommentError("not_found");
  // Comments by people the viewer blocked (or who blocked them) are left out.
  const blocked = user ? [...(await blockedIdsFor(user.id))] : [];
  const comments = await db.comment.findMany({
    where: { angleId, userId: { notIn: blocked } },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: { user: { select: { displayName: true, verified: true, avatarUrl: true } }, _count: { select: { likes: true } }, likes: { where: { userId: user?.id ?? "" }, select: { userId: true } } },
  });
  // Top-level comments in order, each followed by its replies (a reply whose comment is
  // hidden from this viewer is left out too).
  const views = comments.map((c) => toView(c, user, angle.moment.creatorId, { count: c._count.likes, liked: c.likes.length > 0 }));
  // Zawmo's own (verified) comments lead, like a pinned comment; the rest keep their order.
  const top = views.filter((c) => !c.parentId).sort((a, b) => Number(b.authorVerified) - Number(a.authorVerified));
  return top.flatMap((c) => [c, ...views.filter((r) => r.parentId === c.id)]);
}

export async function addComment(user: User, angleId: string, raw: unknown, rawParent: unknown = null) {
  const body = cleanBody(raw);
  if (!body) throw new CommentError("invalid");
  const angle = await visibleAngle(user, angleId);
  if (!angle) throw new CommentError("not_found");

  const lastHour = await db.comment.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (lastHour >= MAX_PER_HOUR) throw new CommentError("too_many");

  // A reply answers a top-level comment on the same angle (replies to a reply attach to
  // that thread's top comment, like TikTok).
  let parentId: string | null = null;
  let parentAuthor: string | null = null;
  if (typeof rawParent === "string" && rawParent) {
    const parent = await db.comment.findUnique({ where: { id: rawParent }, select: { angleId: true, parentId: true, userId: true } });
    if (!parent || parent.angleId !== angleId) throw new CommentError("invalid");
    parentId = parent.parentId ?? rawParent;
    parentAuthor = parent.userId; // the person answered (who wrote the comment tapped)
  }
  const comment = await db.comment.create({ data: { angleId, userId: user.id, body, parentId }, include: { user: { select: { displayName: true, verified: true, avatarUrl: true } } } });
  await db.moment.update({ where: { id: angle.momentId }, data: { lastActivityAt: new Date() } });
  // The person answered hears of the reply, and the shot's owner of the comment (only
  // once when they are the one answered).
  if (parentAuthor) await notify({ userId: parentAuthor, actorId: user.id, kind: "REPLY", angleId, commentId: comment.id });
  if (angle.contributorId !== parentAuthor) await notify({ userId: angle.contributorId, actorId: user.id, kind: "COMMENT", angleId, commentId: comment.id });
  return toView(comment, user, angle.moment.creatorId);
}

export async function deleteComment(user: User, commentId: string) {
  const comment = await db.comment.findUnique({ where: { id: commentId }, include: { angle: { include: { moment: true } } } });
  if (!comment || (comment.userId !== user.id && comment.angle.moment.creatorId !== user.id)) throw new CommentError("not_found");
  await db.comment.delete({ where: { id: commentId } });
}

export async function commentCounts(angleIds: string[]) {
  const groups = await db.comment.groupBy({ by: ["angleId"], where: { angleId: { in: angleIds } }, _count: { _all: true } });
  return new Map(groups.map((g) => [g.angleId, g._count._all]));
}

// ❤️ on a comment (true) or taken back (false); only on comments the person can see.
export async function setCommentLike(user: User, commentId: string, liked: unknown) {
  if (typeof liked !== "boolean") throw new CommentError("invalid");
  const comment = await db.comment.findUnique({ where: { id: commentId }, select: { angleId: true, userId: true } });
  if (!comment || !(await visibleAngle(user, comment.angleId)) || (await blockedIdsFor(user.id)).has(comment.userId)) throw new CommentError("not_found");
  if (liked) await db.commentLike.createMany({ data: [{ commentId, userId: user.id }], skipDuplicates: true });
  else await db.commentLike.deleteMany({ where: { commentId, userId: user.id } });
  return { likes: await db.commentLike.count({ where: { commentId } }), liked };
}
