import { plain } from "@/lib/clip";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { publicCover } from "@/server/media";

// «⬇️ اللحظة الجاية»: where the viewer goes after a moment's last angle, so nobody hits a wall
// (src/app/m/[code]/AngleGallery.tsx). Public moments only — never someone's friends-only one:
// the same place first, then the same kind of picture (its scenes), then the most recently
// active. Each with its first shot (the viewer opens on it) and cover. Kept 10 minutes per
// moment, so the moment page costs no more than one small query now and then.

// firstPart: its first film part (src/server/montage/parts.ts), for «🎬 فيديو لحظة تانية»; null when none.
export type NextMoment = { code: string; title: string; firstAngleId: string; cover: string; firstPart: number | null };

// A shot anyone may see: ready, checked, not expired.
const shownAt = (now: Date) => ({ status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

async function compute(momentId: string, take: number): Promise<NextMoment[]> {
  const here = await db.moment.findUnique({
    where: { id: momentId },
    select: { placeId: true, angles: { where: { status: "READY" }, select: { scene: true, placeId: true }, take: 40 } },
  });
  const places = new Set([here?.placeId, ...(here?.angles.map((a) => a.placeId) ?? [])].filter((p): p is string => !!p));
  const scenes = new Set((here?.angles.map((a) => a.scene) ?? []).filter((s): s is string => !!s && s !== "other"));
  const now = new Date();
  const candidates = await db.moment.findMany({
    where: {
      id: { not: momentId },
      visibility: "PUBLIC",
      status: "ACTIVE",
      kind: { notIn: ["DAILY", "STORY"] },
      demo: false,
      angles: { some: shownAt(now) },
    },
    orderBy: { lastActivityAt: "desc" },
    take: 60,
    select: {
      code: true,
      title: true,
      placeId: true,
      angles: {
        where: shownAt(now),
        // (the moment page's order, so the viewer opens on its first angle — src/server/moments.ts)
        orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
        take: 12,
        select: { id: true, scene: true, placeId: true },
      },
      montages: { where: { part: { not: null }, status: "READY", videoUrl: { not: null } }, orderBy: { part: "asc" }, take: 1, select: { part: true } },
    },
  });
  const scored = candidates
    .filter((m) => m.angles.length > 0)
    .map((m, rank) => {
      const samePlace = (m.placeId && places.has(m.placeId)) || m.angles.some((a) => a.placeId && places.has(a.placeId));
      const sameScene = m.angles.some((a) => a.scene && scenes.has(a.scene));
      return { m, score: (samePlace ? 2 : 0) + (sameScene ? 1 : 0), rank };
    })
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .slice(0, take);
  return Promise.all(
    scored.map(async ({ m }) => ({ code: m.code, title: plain(m.title), firstAngleId: m.angles[0].id, cover: await publicCover(m.angles[0]), firstPart: m.montages[0]?.part ?? null })),
  );
}

// (Uncached, for the tests.)
export const nextMomentsNow = compute;

export const nextMoments = (momentId: string, take = 8) =>
  unstable_cache(() => compute(momentId, take), ["next-moments-2", momentId, String(take)], { revalidate: 600 })();
