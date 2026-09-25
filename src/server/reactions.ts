import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { visibleAngle } from "@/server/access";

// Likes (❤️). Older rows may carry another kind; every reaction counts as a like.
export type Likes = { count: number; liked: boolean };

export class ReactionError extends Error {
  constructor(public code: "not_found" | "invalid") {
    super(code);
  }
}

// Like counts per angle plus whether the viewer liked it, for the angles a viewer can see.
export async function reactionsFor(angleIds: string[], viewer: User | null) {
  const [groups, mine] = await Promise.all([
    db.reaction.groupBy({ by: ["angleId"], where: { angleId: { in: angleIds } }, _count: { _all: true } }),
    viewer ? db.reaction.findMany({ where: { angleId: { in: angleIds }, userId: viewer.id }, select: { angleId: true } }) : Promise.resolve([]),
  ]);
  const result = new Map<string, Likes>(angleIds.map((id) => [id, { count: 0, liked: false }]));
  for (const g of groups) result.get(g.angleId)!.count = g._count._all;
  for (const r of mine) result.get(r.angleId)!.liked = true;
  return result;
}

// Like an angle (true) or take the like back (false). Follows "give to get": someone who
// has not added an angle may only like the one angle they can see.
export async function setReaction(user: User, angleId: string, liked: unknown) {
  if (typeof liked !== "boolean") throw new ReactionError("invalid");
  if (!(await visibleAngle(user, angleId))) throw new ReactionError("not_found");

  if (!liked) await db.reaction.deleteMany({ where: { angleId, userId: user.id } });
  else
    await db.reaction.upsert({
      where: { angleId_userId: { angleId, userId: user.id } },
      create: { angleId, userId: user.id, kind: "HEART" },
      update: { kind: "HEART" },
    });

  return (await reactionsFor([angleId], user)).get(angleId)!;
}

// ── Saved («المحفوظات») ───────────────────────────────────────────────────

export async function savedFor(angleIds: string[], viewer: User | null) {
  if (!viewer || !angleIds.length) return new Set<string>();
  const rows = await db.savedAngle.findMany({ where: { userId: viewer.id, angleId: { in: angleIds } }, select: { angleId: true } });
  return new Set(rows.map((r) => r.angleId));
}

export async function setSaved(user: User, angleId: string, saved: unknown) {
  if (typeof saved !== "boolean") throw new ReactionError("invalid");
  if (!saved) {
    await db.savedAngle.deleteMany({ where: { userId: user.id, angleId } });
    return { saved: false };
  }
  if (!(await visibleAngle(user, angleId))) throw new ReactionError("not_found");
  await db.savedAngle.upsert({ where: { userId_angleId: { userId: user.id, angleId } }, create: { userId: user.id, angleId }, update: {} });
  return { saved: true };
}
