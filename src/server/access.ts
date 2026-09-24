import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Can this user see this angle? The rule behind reactions and comments, matching
// getMomentView's "give to get": the moment's creator and anyone who added an angle
// see every live angle; everyone else sees only the moment's first angle. Public
// moments are open: every live angle is visible.
export async function visibleAngle(user: User, angleId: string) {
  const now = new Date();
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  if (!angle || angle.status !== "READY" || (angle.expiresAt && angle.expiresAt <= now)) return null;
  const { moment } = angle;
  if (moment.status === "HIDDEN" && moment.creatorId !== user.id) return null;

  const unlocked =
    moment.visibility === "PUBLIC" ||
    moment.creatorId === user.id ||
    (await db.angle.count({ where: { momentId: moment.id, contributorId: user.id, status: "READY" } })) > 0;
  if (unlocked) return angle;

  const first = await db.angle.findFirst({
    where: { momentId: moment.id, status: "READY", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    select: { id: true },
  });
  return first?.id === angle.id ? angle : null;
}
