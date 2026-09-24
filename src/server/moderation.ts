import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { visibleAngle } from "@/server/access";
import { viewUrl } from "@/server/media";

export const REPORT_REASONS = ["OFFENSIVE", "SPAM", "PRIVACY", "OTHER"] as const;
type Reason = (typeof REPORT_REASONS)[number];
const MAX_REPORTS_PER_HOUR = 10;

export class ModerationError extends Error {
  constructor(public code: "not_found" | "invalid" | "too_many" | "forbidden") {
    super(code);
  }
}

// ── Blocking ──────────────────────────────────────────────────────────────

// Everyone the user blocked or was blocked by: they no longer reach each other.
export async function blockedIdsFor(userId: string) {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

export async function blockUser(user: User, targetId: string) {
  if (targetId === user.id) throw new ModerationError("invalid");
  if (!(await db.user.count({ where: { id: targetId } }))) throw new ModerationError("not_found");
  await db.block.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetId } },
    create: { blockerId: user.id, blockedId: targetId },
    update: {},
  });
}

// ── Reporting ─────────────────────────────────────────────────────────────

export type ReportInput = { angleId?: unknown; commentId?: unknown; reason: unknown; note?: unknown; block?: unknown };

// Report an angle or a comment the reporter can see. Optionally block its author too.
export async function reportContent(user: User, input: ReportInput) {
  const reason = REPORT_REASONS.includes(input.reason as Reason) ? (input.reason as Reason) : null;
  if (!reason) throw new ModerationError("invalid");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) || null : null;

  let target: { momentId: string; angleId: string | null; commentId: string | null; authorId: string };
  if (typeof input.commentId === "string") {
    const comment = await db.comment.findUnique({ where: { id: input.commentId } });
    if (!comment || !(await visibleAngle(user, comment.angleId))) throw new ModerationError("not_found");
    const angle = await db.angle.findUniqueOrThrow({ where: { id: comment.angleId }, select: { momentId: true } });
    target = { momentId: angle.momentId, angleId: comment.angleId, commentId: comment.id, authorId: comment.userId };
  } else if (typeof input.angleId === "string") {
    const angle = await visibleAngle(user, input.angleId);
    if (!angle) throw new ModerationError("not_found");
    target = { momentId: angle.momentId, angleId: angle.id, commentId: null, authorId: angle.contributorId };
  } else throw new ModerationError("invalid");

  if (target.authorId === user.id) throw new ModerationError("forbidden");
  const lastHour = await db.report.count({ where: { reporterId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (lastHour >= MAX_REPORTS_PER_HOUR) throw new ModerationError("too_many");

  await db.report.create({
    data: { reporterId: user.id, momentId: target.momentId, angleId: target.angleId, commentId: target.commentId, reason, note },
  });
  if (input.block === true) await blockUser(user, target.authorId);
}

// ── Admin review ──────────────────────────────────────────────────────────

export function assertAdmin(user: User | null): asserts user is User {
  if (!user?.isAdmin) throw new ModerationError("forbidden");
}

// Open reports, one row per reported item (a comment, or an angle), with how many
// people reported it and why.
export async function openReports(admin: User) {
  assertAdmin(admin);
  const reports = await db.report.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: {
      reporter: { select: { displayName: true } },
      moment: { select: { code: true, title: true } },
      angle: { include: { contributor: { select: { displayName: true } } } },
      comment: { include: { user: { select: { displayName: true } } } },
    },
  });

  const groups = new Map<string, typeof reports>();
  for (const r of reports) {
    const key = r.commentId ? `c:${r.commentId}` : `a:${r.angleId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return Promise.all(
    [...groups.entries()].map(async ([key, rs]) => {
      const first = rs[0];
      const isComment = key.startsWith("c:");
      return {
        key,
        kind: isComment ? ("comment" as const) : ("angle" as const),
        count: rs.length,
        reasons: [...new Set(rs.map((r) => r.reason))],
        notes: rs.map((r) => r.note).filter((n): n is string => !!n),
        reporters: [...new Set(rs.map((r) => r.reporter?.displayName ?? "—"))],
        firstAt: first.createdAt,
        momentCode: first.moment?.code ?? null,
        momentTitle: first.moment?.title ?? null,
        authorName: isComment ? first.comment?.user.displayName : first.angle?.contributor.displayName,
        commentBody: isComment ? first.comment?.body ?? null : null,
        angleStatus: first.angle?.status ?? null,
        previewUrl: !isComment && first.angle ? await viewUrl(first.angle.mediaType === "VIDEO" ? first.angle.thumbPath : first.angle.mediaPath) : null,
        mediaType: first.angle?.mediaType ?? null,
      };
    }),
  );
}

// Act on a reported item: hide the angle (reversible), delete the comment, or dismiss.
// Every open report about the same item is closed with the same outcome.
export async function resolveReports(admin: User, key: string, action: "hide" | "delete" | "dismiss") {
  assertAdmin(admin);
  const [type, id] = key.split(":");
  if (!id || (type !== "a" && type !== "c")) throw new ModerationError("invalid");
  // Angles are hidden (reversible); comments are deleted. Anything else is a mistake.
  if ((type === "a" && action === "delete") || (type === "c" && action === "hide")) throw new ModerationError("invalid");
  const where = type === "c" ? { commentId: id, resolvedAt: null } : { angleId: id, commentId: null, resolvedAt: null };

  if (action === "hide" && type === "a") await db.angle.update({ where: { id }, data: { status: "HIDDEN" } });
  // "No problem" on an angle the automatic check hid: a false alarm, so put it back.
  if (action === "dismiss" && type === "a") await db.angle.updateMany({ where: { id, status: "HIDDEN" }, data: { status: "READY" } });
  // A deleted comment takes its reports with it (cascade), so close them first.
  const resolution = action === "hide" ? "hidden" : action === "delete" ? "deleted" : "dismissed";
  await db.report.updateMany({ where, data: { resolvedAt: new Date(), resolution } });
  if (action === "delete" && type === "c") await db.comment.delete({ where: { id } }).catch(() => {});
}
