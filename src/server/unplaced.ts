import { db } from "@/lib/db";
import { coverOf } from "@/server/media";
import { phenomenonOf } from "@/server/events";

// «📍 وين صوّرتهن؟»: a person's public shots that have no place (phones strip a photo's
// location on the web), grouped by moment — one answer places a moment's shots. A place puts
// them on the town's page, and a sky of several people (sunset, rain…) on its event page
// (src/server/events.ts). Shots of the sky come first: they make event pages.

const unplacedWhere = (userId: string) => ({
  contributorId: userId,
  status: "READY" as const,
  screening: "allowed",
  placeId: null,
  moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const }, demo: false },
});

export async function unplacedCount(userId: string) {
  return db.angle.count({ where: unplacedWhere(userId) });
}

export async function unplacedShots(userId: string, take = 60) {
  const shots = await db.angle.findMany({
    where: unplacedWhere(userId),
    select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, scene: true, weather: true, filter: true, moment: { select: { code: true, title: true } } },
    orderBy: { uploadedAt: "desc" },
    take,
  });
  const groups = new Map<string, { code: string; title: string; sky: boolean; shots: { id: string; coverUrl: string | null; filter: string | null }[] }>();
  for (const s of shots) {
    const g = groups.get(s.moment.code) ?? { code: s.moment.code, title: s.moment.title, sky: false, shots: [] };
    g.shots.push({ id: s.id, coverUrl: await coverOf(s), filter: s.filter });
    if (phenomenonOf(s.scene, s.weather)) g.sky = true;
    groups.set(s.moment.code, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.sky) - Number(a.sky));
}

// Who to ask once: people with public sky shots (sunset, moon, rain…) that have no place.
export async function skyShotOwnersWithoutPlace() {
  const shots = await db.angle.findMany({
    where: { status: "READY", screening: "allowed", placeId: null, moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false } },
    select: { contributorId: true, scene: true, weather: true },
  });
  const owners = new Map<string, number>();
  for (const s of shots) if (phenomenonOf(s.scene, s.weather)) owners.set(s.contributorId, (owners.get(s.contributorId) ?? 0) + 1);
  return owners;
}
