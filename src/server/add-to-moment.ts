import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { coverOf } from "@/server/media";

// «شارك لزاومو» from the gallery: the person's recent moments they may add a shot to — the ones
// they started or are in (never «لحظة اليوم»; «مع الوقت» only their own) — newest activity first,
// each with its cover, so the shared photos or videos go into one of them instead of a new moment.
export async function momentsToAddTo(user: User, take = 12) {
  const moments = await db.moment.findMany({
    where: {
      status: "ACTIVE",
      kind: { not: "DAILY" },
      OR: [{ creatorId: user.id }, { kind: { not: "STORY" }, participants: { some: { userId: user.id } } }],
    },
    orderBy: { lastActivityAt: "desc" },
    take,
    select: {
      code: true,
      title: true,
      kind: true,
      angles: { where: { status: "READY" }, orderBy: { uploadedAt: "asc" }, take: 1, select: { mediaType: true, mediaPath: true, thumbPath: true, smallPath: true } },
      _count: { select: { angles: { where: { status: "READY" } } } },
    },
  });
  return Promise.all(
    moments.map(async (m) => ({ code: m.code, title: m.title, story: m.kind === "STORY", angles: m._count.angles, cover: m.angles[0] ? await coverOf(m.angles[0]) : null })),
  );
}
