import { ReactionKind } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const REACTION_KINDS = Object.values(ReactionKind);
export type ReactionCounts = Record<ReactionKind, number>;

export class ReactionError extends Error {
  constructor(public code: "not_found" | "invalid") {
    super(code);
  }
}

const emptyCounts = (): ReactionCounts => ({ HEART: 0, LAUGH: 0, FIRE: 0, WOW: 0 });

// Counts per angle plus the viewer's own reaction, for the angles a viewer can see.
export async function reactionsFor(angleIds: string[], viewer: User | null) {
  const [groups, mine] = await Promise.all([
    db.reaction.groupBy({ by: ["angleId", "kind"], where: { angleId: { in: angleIds } }, _count: { _all: true } }),
    viewer ? db.reaction.findMany({ where: { angleId: { in: angleIds }, userId: viewer.id } }) : Promise.resolve([]),
  ]);
  const result = new Map(angleIds.map((id) => [id, { counts: emptyCounts(), mine: null as ReactionKind | null }]));
  for (const g of groups) result.get(g.angleId)!.counts[g.kind] = g._count._all;
  for (const r of mine) result.get(r.angleId)!.mine = r.kind;
  return result;
}

// React to an angle (kind) or take the reaction back (null). Follows "give to get":
// someone who has not added an angle may only react to the one angle they can see.
export async function setReaction(user: User, angleId: string, kind: unknown) {
  if (kind !== null && !REACTION_KINDS.includes(kind as ReactionKind)) throw new ReactionError("invalid");

  const now = new Date();
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  const live = angle && angle.status === "READY" && (!angle.expiresAt || angle.expiresAt > now);
  if (!angle || !live) throw new ReactionError("not_found");
  const { moment } = angle;
  if (moment.status === "HIDDEN" && moment.creatorId !== user.id) throw new ReactionError("not_found");

  const unlocked =
    moment.creatorId === user.id ||
    (await db.angle.count({ where: { momentId: moment.id, contributorId: user.id, status: "READY" } })) > 0;
  if (!unlocked) {
    const first = await db.angle.findFirst({
      where: { momentId: moment.id, status: "READY", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
      select: { id: true },
    });
    if (first?.id !== angle.id) throw new ReactionError("not_found");
  }

  const key = { angleId_userId: { angleId, userId: user.id } };
  if (kind === null) await db.reaction.deleteMany({ where: { angleId, userId: user.id } });
  else await db.reaction.upsert({ where: key, create: { angleId, userId: user.id, kind: kind as ReactionKind }, update: { kind: kind as ReactionKind } });

  return (await reactionsFor([angleId], user)).get(angleId)!;
}
