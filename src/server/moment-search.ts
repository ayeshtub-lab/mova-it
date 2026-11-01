import { plain } from "@/lib/clip";
import type { User } from "@/generated/prisma/client";
import { normalize } from "@/lib/arabic";
import { db } from "@/lib/db";
import { publicCover } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { placeViews } from "@/server/places";
import { shownAngle } from "@/server/seo";

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
      title: plain(m.title),
      placeName: (m.placeId && places.get(m.placeId)?.name) || m.placeName,
      coverUrl: await publicCover(m.angles[0]),
      angles: m._count.angles,
      people: m._count.participants,
    })),
  );
}

// «👤 أشخاص» in the same search (his ask, 2026-11-01): members found by name, the way moments are
// (each word, however it was spelled). Only members with a profile (no guests) and at least one
// public shot — someone who shares nothing publicly can't be found — never one either side blocked,
// never Zawmo's own system account. The most shared first.
const PEOPLE = 8;

export type PersonCard = { id: string; name: string; avatarUrl: string | null; verified: boolean; shots: number };

export async function findPeople(viewer: User | null, rawQuery: string | null): Promise<PersonCard[]> {
  const q = rawQuery ? rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY) : "";
  const words = q ? [...new Set(q.split(" ").map(normalize).filter(Boolean))] : [];
  if (!words.length) return [];
  const ids = (
    await db.$queryRaw<{ id: string }[]>`
      SELECT u."id" FROM "User" u
      WHERE u."isGuest" = false AND u."isSystem" = false
        AND (SELECT bool_and(translate(lower(u."displayName"), 'أإآٱةىؤئ', 'ااااهيوي') LIKE '%' || w || '%') FROM unnest(${words}::text[]) AS w)
      LIMIT 100`
  ).map((r) => r.id);
  if (!ids.length) return [];
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const shown = shownAngle(new Date());
  const people = await db.user.findMany({
    where: { id: { in: ids, notIn: blocked }, angles: { some: shown } },
    select: { id: true, displayName: true, avatarUrl: true, verified: true, _count: { select: { angles: { where: shown } } } },
  });
  return people
    .map((p) => ({ id: p.id, name: p.displayName, avatarUrl: p.avatarUrl, verified: p.verified, shots: p._count.angles }))
    .sort((a, b) => b.shots - a.shots)
    .slice(0, PEOPLE);
}
