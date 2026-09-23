import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { visibleAngle } from "@/server/access";

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

const toView = (c: { id: string; body: string; createdAt: Date; userId: string; user: { displayName: string } }, viewer: User, creatorId: string) => ({
  id: c.id,
  body: c.body,
  createdAt: c.createdAt,
  authorName: c.user.displayName,
  mine: c.userId === viewer.id,
  canDelete: c.userId === viewer.id || creatorId === viewer.id,
});

export async function listComments(user: User, angleId: string) {
  const angle = await visibleAngle(user, angleId);
  if (!angle) throw new CommentError("not_found");
  const comments = await db.comment.findMany({
    where: { angleId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { displayName: true } } },
  });
  return comments.map((c) => toView(c, user, angle.moment.creatorId));
}

export async function addComment(user: User, angleId: string, raw: unknown) {
  const body = cleanBody(raw);
  if (!body) throw new CommentError("invalid");
  const angle = await visibleAngle(user, angleId);
  if (!angle) throw new CommentError("not_found");

  const lastHour = await db.comment.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (lastHour >= MAX_PER_HOUR) throw new CommentError("too_many");

  const comment = await db.comment.create({ data: { angleId, userId: user.id, body }, include: { user: { select: { displayName: true } } } });
  await db.moment.update({ where: { id: angle.momentId }, data: { lastActivityAt: new Date() } });
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
