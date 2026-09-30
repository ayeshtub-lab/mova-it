import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/server/notifications";

// «⭐ اختيار زاومو»: an official (verified) account picks a public shot it likes. A picked shot
// carries a badge and leads the home wheel, the showcase and «اكتشف»; its owner hears of it
// once. Only public, checked, real shots can be picked — never friends-only, «لحظة اليوم» or
// an illustrative (demo) moment.

export class PickError extends Error {
  constructor(public code: "forbidden" | "not_found" | "invalid") {
    super(code);
  }
}

export async function setPick(user: User, angleId: string, picked: unknown) {
  if (typeof picked !== "boolean") throw new PickError("invalid");
  if (!user.verified) throw new PickError("forbidden");
  const angle = await db.angle.findFirst({
    where: {
      id: angleId,
      status: "READY",
      screening: "allowed",
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false },
    },
    select: { id: true, contributorId: true, pickedAt: true },
  });
  if (!angle) throw new PickError("not_found");
  if (picked === !!angle.pickedAt) return { picked };
  await db.angle.update({ where: { id: angle.id }, data: { pickedAt: picked ? new Date() : null } });
  if (picked) {
    await notify(
      { userId: angle.contributorId, actorId: user.id, kind: "PICKED", angleId: angle.id },
      { key: `picked:${angle.id}`, where: { userId: angle.contributorId, kind: "PICKED", angleId: angle.id } },
    );
  }
  return { picked };
}
