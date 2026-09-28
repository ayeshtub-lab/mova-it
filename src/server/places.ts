import { db } from "@/lib/db";
import { normalize, withoutAl } from "@/lib/arabic";
import { SKY_SCENES } from "@/lib/scenes";
import { blockedIdsFor } from "@/server/moderation";
import { coverOf } from "@/server/media";

// Zawmo law for places (see the privacy page): a city/village/neighbourhood name only, never
// coordinates; friends-only moments never show on a place's page; a place with fewer than
// PEOPLE_SHOWN_FROM people shows no counts.
export const PEOPLE_SHOWN_FROM = 20;

export type PlaceView = { id: string; slug: string; name: string; context: string | null; kind: string };

const nameOf = (p: { nameAr: string; kind: string }) => (p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr);

const KIND_RANK: Record<string, number> = { CITY: 0, TOWN: 1, CAMP: 2, VILLAGE: 3, NEIGHBOURHOOD: 4, GOVERNORATE: 5, COUNTRY: 6 };

// «بيت لحم، فلسطين» — what tells two places with the same name apart.
async function contextOf(parentIds: (string | null)[]) {
  const ids = [...new Set(parentIds.filter((x): x is string => !!x))];
  const parents = await db.place.findMany({ where: { id: { in: ids } }, select: { id: true, nameAr: true, kind: true, parentId: true } });
  const grand = await db.place.findMany({
    where: { id: { in: parents.map((p) => p.parentId).filter((x): x is string => !!x) } },
    select: { id: true, nameAr: true, kind: true },
  });
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const grandById = new Map(grand.map((p) => [p.id, p]));
  const label = (x: { nameAr: string; kind: string }) => (x.kind === "GOVERNORATE" ? `محافظة ${x.nameAr}` : x.nameAr);
  return (parentId: string | null) => {
    const p = parentId ? parentById.get(parentId) : null;
    if (!p) return null;
    const g = p.parentId ? grandById.get(p.parentId) : null;
    return g ? `${label(p)}، ${label(g)}` : label(p);
  };
}

// Autocomplete: «بيتل» → بيت لحم, «ارطاس» → أرطاس. Starts-with first, then bigger places.
export async function searchPlaces(query: string, limit = 8): Promise<PlaceView[]> {
  const q = normalize(query);
  if (q.length < 2) return [];
  const rows = await db.place.findMany({
    where: { OR: [{ search: { contains: q } }, { search: { contains: withoutAl(q) } }], kind: { notIn: ["COUNTRY"] } },
    select: { id: true, slug: true, nameAr: true, kind: true, parentId: true, search: true, population: true },
    take: 200,
  });
  const starts = (s: string) => s.split(" ").some((w) => w.startsWith(q) || w.startsWith(withoutAl(q)));
  rows.sort(
    (a, b) =>
      Number(starts(b.search)) - Number(starts(a.search)) ||
      (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) ||
      (b.population ?? 0) - (a.population ?? 0),
  );
  const top = rows.slice(0, limit);
  const ctx = await contextOf(top.map((r) => r.parentId));
  return top.map((r) => ({ id: r.id, slug: r.slug, name: nameOf(r), kind: r.kind, context: ctx(r.parentId) }));
}

// A place written as text («ارطاس», «بيت لحم - المدبسة»): the standard place with exactly that
// name (Palestine first, then the biggest), or null. Used when the writer didn't pick one.
export async function resolvePlaceText(text: string | null | undefined) {
  if (!text) return null;
  for (const part of [text, ...text.split(/\s[-–—،,]\s?|[-–—،,]/)]) {
    const q = normalize(part);
    if (q.length < 2) continue;
    const rows = await db.place.findMany({
      where: { search: { contains: q }, kind: { notIn: ["COUNTRY"] } },
      select: { id: true, nameAr: true, countryCode: true, kind: true, population: true },
      take: 50,
    });
    const exact = rows.filter((r) => normalize(r.nameAr) === q || withoutAl(normalize(r.nameAr)) === withoutAl(q));
    exact.sort(
      (a, b) =>
        Number(b.countryCode === "PS") - Number(a.countryCode === "PS") ||
        Number(a.kind === "GOVERNORATE") - Number(b.kind === "GOVERNORATE") ||
        (b.population ?? 0) - (a.population ?? 0),
    );
    if (exact[0]) return exact[0].id;
  }
  return null;
}

// A place id sent by a form or a phone: kept only if it's a real place below country level.
export async function validPlaceId(id: unknown) {
  if (typeof id !== "string" || !id || id.length > 40) return null;
  const p = await db.place.findUnique({ where: { id }, select: { id: true, kind: true } });
  return p && p.kind !== "COUNTRY" ? p.id : null;
}

export async function placeViews(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map<string, PlaceView>();
  const rows = await db.place.findMany({ where: { id: { in: wanted } }, select: { id: true, slug: true, nameAr: true, kind: true, parentId: true } });
  const ctx = await contextOf(rows.map((r) => r.parentId));
  return new Map(rows.map((r) => [r.id, { id: r.id, slug: r.slug, name: nameOf(r), kind: r.kind, context: ctx(r.parentId) }]));
}

// A place and everything inside it (a governorate's villages, a city's neighbourhoods).
async function withDescendants(id: string) {
  const all = [id];
  let frontier = [id];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    frontier = (await db.place.findMany({ where: { parentId: { in: frontier } }, select: { id: true } })).map((p) => p.id);
    all.push(...frontier);
  }
  return all;
}

// A place's public page: its public shots (checked, not «لحظة اليوم»), the places inside it
// that have shots, and — only from PEOPLE_SHOWN_FROM people up — how many people shot there.
// With a scene («?scene=sunset», from a Discover card): only that scene, from the last 24 hours.
export async function placePage(slug: string, viewerId: string | null, take = 60, scene: string | null = null) {
  const place = await db.place.findUnique({ where: { slug } });
  if (!place) return null;
  const ids = await withDescendants(place.id);
  const blocked = viewerId ? [...(await blockedIdsFor(viewerId))] : [];
  const shown = {
    placeId: { in: ids },
    status: "READY" as const,
    screening: "allowed",
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const } },
    contributorId: { notIn: blocked },
    ...(scene ? { scene, uploadedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } : {}),
  };
  const [angles, people, childCounts] = await Promise.all([
    db.angle.findMany({
      where: shown,
      orderBy: { uploadedAt: "desc" },
      take,
      include: { moment: { select: { code: true, title: true } }, contributor: { select: { displayName: true } } },
    }),
    db.angle.findMany({ where: shown, distinct: ["contributorId"], select: { contributorId: true } }),
    db.angle.groupBy({ by: ["placeId"], where: shown, _count: { _all: true } }),
  ]);

  // The chain above it: فلسطين › محافظة بيت لحم › بيت لحم.
  const trail: { slug: string; name: string }[] = [];
  let up = place.parentId;
  while (up) {
    const p = await db.place.findUnique({ where: { id: up }, select: { slug: true, nameAr: true, kind: true, parentId: true } });
    if (!p) break;
    trail.unshift({ slug: p.slug, name: p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr });
    up = p.parentId;
  }

  // Places directly inside this one that have shots (a city's neighbourhoods, a governorate's towns).
  const withShots = new Set(childCounts.map((c) => c.placeId));
  const children = await db.place.findMany({ where: { parentId: place.id }, select: { id: true, slug: true, nameAr: true } });
  const inside = await Promise.all(
    children.map(async (c) => ({ c, has: withShots.has(c.id) || (await withDescendants(c.id)).some((d) => withShots.has(d)) })),
  );

  return {
    place: { id: place.id, slug: place.slug, name: place.kind === "GOVERNORATE" ? `محافظة ${place.nameAr}` : place.nameAr, kind: place.kind, countryCode: place.countryCode },
    trail,
    people: people.length >= PEOPLE_SHOWN_FROM ? people.length : null,
    inside: inside.filter((x) => x.has).map((x) => ({ slug: x.c.slug, name: x.c.nameAr })),
    shots: await Promise.all(
      angles.map(async (a) => ({
        id: a.id,
        video: a.mediaType === "VIDEO",
        filter: a.filter,
        imageUrl: await coverOf(a),
        verified: a.placeVerified,
        momentCode: a.moment.code,
        title: a.moment.title,
        name: a.contributor.displayName,
      })),
    ),
  };
}

// The shot's owner removes (null) or changes its place. Removing it also clears «موثّق».
export async function setAnglePlace(user: { id: string }, angleId: string, placeId: unknown) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { contributorId: true } });
  if (!angle || angle.contributorId !== user.id) return null;
  const id = placeId === null ? null : await validPlaceId(placeId);
  if (placeId !== null && !id) return null;
  await db.angle.update({
    where: { id: angleId },
    data: { placeId: id, placeFrom: id ? "OWNER" : null, placeVerified: false, ipCountryMatch: null },
  });
  return { place: id ? ((await placeViews([id])).get(id) ?? null) : null };
}

// «🌅 غروب بيت لحم اليوم · 7 زوايا»: today's scenes that several people shot in one place
// (public, checked shots of the last 24 hours; a neighbourhood counts for its city).
export async function sceneCards(viewerId: string | null, take = 8) {
  const blocked = viewerId ? [...(await blockedIdsFor(viewerId))] : [];
  const angles = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      scene: { not: null, notIn: ["other"] },
      placeId: { not: null },
      uploadedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      contributorId: { notIn: blocked },
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" } },
    },
    orderBy: { uploadedAt: "desc" },
    include: { place: { select: { id: true, kind: true, parentId: true } } },
    take: 500,
  });
  // The area a card is about: a sky scene (one sunset, one snowfall) covers the governorate,
  // anything else its town — a neighbourhood always counts for its city.
  const parentIds = [...new Set(angles.map((a) => a.place!.parentId).filter((x): x is string => !!x))];
  const parents = new Map((await db.place.findMany({ where: { id: { in: parentIds } }, select: { id: true, kind: true, parentId: true } })).map((p) => [p.id, p]));
  const areaOf = (place: { id: string; kind: string; parentId: string | null }, scene: string) => {
    const town = place.kind === "NEIGHBOURHOOD" && place.parentId ? (parents.get(place.parentId) ?? place) : place;
    if (!SKY_SCENES.includes(scene)) return town.id;
    const up = town.parentId ? (parents.get(town.parentId) ?? null) : null;
    return up?.kind === "GOVERNORATE" ? up.id : town.id;
  };
  const groups = new Map<string, { scene: string; areaId: string; angles: typeof angles; people: Set<string> }>();
  for (const a of angles) {
    const areaId = areaOf(a.place!, a.scene!);
    const key = `${a.scene}|${areaId}`;
    const g = groups.get(key) ?? { scene: a.scene!, areaId, angles: [], people: new Set<string>() };
    g.angles.push(a);
    g.people.add(a.contributorId);
    groups.set(key, g);
  }
  // A card needs a real shared moment: at least 3 shots by at least 2 people.
  const top = [...groups.values()].filter((g) => g.angles.length >= 3 && g.people.size >= 2).sort((a, b) => b.angles.length - a.angles.length).slice(0, take);
  const places = await placeViews(top.map((g) => g.areaId));
  return Promise.all(
    top.map(async (g) => ({
      scene: g.scene,
      slug: places.get(g.areaId)?.slug ?? "",
      placeName: places.get(g.areaId)?.name ?? "",
      count: g.angles.length,
      coverUrl: await coverOf(g.angles[0]),
    })),
  );
}
