import type { User } from "@/generated/prisma/client";
import { normalize } from "@/lib/arabic";
import { db } from "@/lib/db";
import { publicCover } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { placeViews } from "@/server/places";

// «اكتشف ← لحظات»: public moments as cards, newest activity first, or those whose name,
// description or place match what was typed («عرس أحمد»، «قهوة الصباح»). Only public,
// shared moments (no «لحظة اليوم», no «مع الوقت») with at least one checked shot — never a
// friends-only or link-only one, never an empty one.

const TAKE = 30;
export const MAX_QUERY = 60;

export type MomentCard = { code: string; title: string; placeName: string | null; coverUrl: string; angles: number; people: number };

export async function findMoments(viewer: User | null, rawQuery: string | null): Promise<MomentCard[]> {
  const q = rawQuery ? rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY) : "";
  const now = new Date();
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const shown = { status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], contributorId: { notIn: blocked } };

  // Each word must be found in the name, the description or the place, however it was spelled:
  // both sides are folded the same way (أ/إ/آ → ا، ة → ه، ى → ي…, src/lib/arabic.ts) inside
  // the database, so «صفيحه» finds «صفيحة».
  const words = q ? [...new Set(q.split(" ").map(normalize).filter(Boolean))] : [];
  const ids = words.length
    ? (
        await db.$queryRaw<{ id: string }[]>`
          SELECT m."id" FROM "Moment" m LEFT JOIN "Place" p ON p."id" = m."placeId"
          WHERE m."visibility" = 'PUBLIC' AND m."status" = 'ACTIVE'
            AND (SELECT bool_and(translate(lower(m."title" || ' ' || coalesce(m."description", '') || ' ' || coalesce(m."placeName", '')), 'أإآٱةىؤئ', 'ااااهيوي') LIKE '%' || w || '%' OR coalesce(p."search", '') LIKE '%' || w || '%')
                 FROM unnest(${words}::text[]) AS w)
          ORDER BY m."lastActivityAt" DESC LIMIT 200`
      ).map((r) => r.id)
    : null;

  const moments = await db.moment.findMany({
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      demo: false,
      kind: { notIn: ["DAILY", "STORY"] },
      creatorId: { notIn: blocked },
      angles: { some: shown },
      ...(ids ? { id: { in: ids } } : {}),
    },
    orderBy: { lastActivityAt: "desc" },
    take: TAKE,
    select: {
      code: true,
      title: true,
      placeId: true,
      placeName: true,
      _count: { select: { participants: true, angles: { where: shown } } },
      angles: { where: shown, orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], take: 1, select: { id: true } },
    },
  });
  const places = await placeViews(moments.map((m) => m.placeId));
  return Promise.all(
    moments.map(async (m) => ({
      code: m.code,
      title: m.title,
      placeName: (m.placeId && places.get(m.placeId)?.name) || m.placeName,
      coverUrl: await publicCover(m.angles[0]),
      angles: m._count.angles,
      people: m._count.participants,
    })),
  );
}
