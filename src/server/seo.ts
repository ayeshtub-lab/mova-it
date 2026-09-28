import { db } from "@/lib/db";

// What search engines may list: only what anyone can already open without signing in.
// Friends-only, hidden and «لحظة اليوم» moments never appear (their pages say noindex too).

// A moment's own page is indexable when it is public, not «لحظة اليوم», and has something to see.
export const momentIndexable = (m: { visibility: string; kind: string; angleCount: number }) =>
  m.visibility === "PUBLIC" && m.kind !== "DAILY" && m.angleCount > 0;

// A public shot as place pages show it (src/server/places.ts placePage).
const shownAngle = (now: Date) => ({
  status: "READY" as const,
  screening: "allowed",
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const } },
});

// The sitemap's moments and places, each with when it last changed.
export async function sitemapEntries(now = new Date()) {
  const [moments, angles] = await Promise.all([
    db.moment.findMany({
      where: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, angles: { some: shownAngle(now) } },
      select: { code: true, lastActivityAt: true },
      orderBy: { lastActivityAt: "desc" },
      take: 5000,
    }),
    db.angle.groupBy({ by: ["placeId"], where: { ...shownAngle(now), placeId: { not: null } }, _max: { uploadedAt: true } }),
  ]);

  // A place page lists the shots of the places inside it too, so its parents count as well.
  const latest = new Map<string, Date>();
  const bump = (id: string, at: Date) => {
    const was = latest.get(id);
    if (!was || was < at) latest.set(id, at);
  };
  let frontier = angles.filter((a) => a.placeId && a._max.uploadedAt).map((a) => ({ id: a.placeId!, at: a._max.uploadedAt! }));
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    frontier.forEach((p) => bump(p.id, p.at));
    const rows = await db.place.findMany({ where: { id: { in: frontier.map((p) => p.id) } }, select: { id: true, parentId: true } });
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    frontier = frontier.flatMap((p) => (parentOf.get(p.id) ? [{ id: parentOf.get(p.id)!, at: p.at }] : []));
  }
  const places = await db.place.findMany({ where: { id: { in: [...latest.keys()] } }, select: { id: true, slug: true } });

  return {
    moments: moments.map((m) => ({ code: m.code, updatedAt: m.lastActivityAt })),
    places: places.map((p) => ({ slug: p.slug, updatedAt: latest.get(p.id)! })),
  };
}
