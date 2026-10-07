import { db } from "@/lib/db";
import { publicCover } from "@/server/media";
import { withDescendants } from "@/server/places";

// «🌧️ مطر رام الله والبيرة · 7 أكتوبر 2026 — 12 صورة من 5 أشخاص»: a day's rain, snow, sunset,
// sunrise or moon in one area, told by the people who were there. A page of its own that
// stays (/e/[area]/[scene]/[day]) — the answer to «مطر رام الله اليوم» while it rains, and
// the record of it after. Built from public shots only, and only when it is a real shared
// moment: at least 3 shots by at least 2 people (otherwise there is no page at all).
// A shot belongs to the phenomenon it shows (its scene), or — for an outdoor one — to the
// weather it was taken in (src/server/weather.ts): a street in the rain is a rain shot; a
// plate of food on a rainy day is not.

export const PHENOMENA = ["rain", "snow", "sunset", "sunrise", "sky"] as const;
export type Phenomenon = (typeof PHENOMENA)[number];
export const isPhenomenon = (v: unknown): v is Phenomenon => typeof v === "string" && (PHENOMENA as readonly string[]).includes(v);
export const MIN_SHOTS = 3;
export const MIN_PEOPLE = 2;

const OUTDOOR = new Set(["nature", "street", "sea", "other"]);
const WEATHER_PHENOMENON: Record<string, Phenomenon> = {
  lightrain: "rain",
  rain: "rain",
  heavyrain: "rain",
  thunder: "rain",
  sleet: "snow",
  lightsnow: "snow",
  snow: "snow",
  heavysnow: "snow",
};

export function phenomenonOf(scene: string | null, weather: string | null): Phenomenon | null {
  if (isPhenomenon(scene)) return scene;
  if ((scene === null || OUTDOOR.has(scene)) && weather) return WEATHER_PHENOMENON[weather] ?? null;
  return null;
}

// Days are Mecca calendar days (UTC+3), like the rest of Zawmo.
const MECCA_MS = 3 * 60 * 60 * 1000;
export const eventDay = (at: Date) => new Date(at.getTime() + MECCA_MS).toISOString().slice(0, 10);
const dayRange = (day: string) => {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - MECCA_MS);
  return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

// A sky is shared by a whole region: an event's area is the governorate (or, where there is
// none, the town — never a neighbourhood).
type PlaceNode = { id: string; kind: string; parentId: string | null };
export async function areasOf(placeIds: string[]) {
  const nodes = new Map<string, PlaceNode>();
  let frontier = [...new Set(placeIds)];
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const rows = await db.place.findMany({ where: { id: { in: frontier } }, select: { id: true, kind: true, parentId: true } });
    rows.forEach((r) => nodes.set(r.id, r));
    frontier = rows.map((r) => r.parentId).filter((p): p is string => !!p && !nodes.has(p));
  }
  const areaOf = (id: string): string => {
    let p = nodes.get(id);
    const start = p;
    while (p) {
      if (p.kind === "GOVERNORATE") return p.id;
      if (p.kind === "COUNTRY") break;
      p = p.parentId ? nodes.get(p.parentId) : undefined;
    }
    // No governorate above it: the town itself (a neighbourhood counts for its city).
    if (start?.kind === "NEIGHBOURHOOD" && start.parentId && nodes.has(start.parentId)) return start.parentId;
    return id;
  };
  return new Map(placeIds.map((id) => [id, areaOf(id)]));
}

const shownPublic = (now: Date) => ({
  status: "READY" as const,
  screening: "allowed",
  placeId: { not: null },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const }, demo: false },
});

export type EventRef = { slug: string; areaName: string; scene: Phenomenon; day: string; shots: number; people: number; coverUrl: string; updatedAt: Date };

// Every event since `since` (or inside `areaId`), newest first: for the sitemap and place pages.
export async function findEvents({ since, areaId, now = new Date(), take = 500 }: { since: Date; areaId?: string; now?: Date; take?: number }): Promise<EventRef[]> {
  const inArea = areaId ? await withDescendants(areaId) : null;
  const angles = await db.angle.findMany({
    where: {
      ...shownPublic(now),
      ...(inArea ? { placeId: { in: inArea } } : {}),
      uploadedAt: { gte: since },
      AND: [{ OR: [{ scene: { in: [...PHENOMENA] } }, { weather: { in: Object.keys(WEATHER_PHENOMENON) } }] }],
    },
    select: { id: true, scene: true, weather: true, placeId: true, contributorId: true, capturedAt: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
    take: 5000,
  });
  const areas = await areasOf(angles.map((a) => a.placeId!));
  const groups = new Map<string, { areaId: string; scene: Phenomenon; day: string; ids: string[]; people: Set<string>; updatedAt: Date }>();
  for (const a of angles) {
    const scene = phenomenonOf(a.scene, a.weather);
    if (!scene) continue;
    const areaId = areas.get(a.placeId!)!;
    const day = eventDay(a.capturedAt ?? a.uploadedAt);
    const key = `${areaId}|${scene}|${day}`;
    const g = groups.get(key) ?? { areaId, scene, day, ids: [], people: new Set<string>(), updatedAt: a.uploadedAt };
    g.ids.push(a.id);
    g.people.add(a.contributorId);
    if (a.uploadedAt > g.updatedAt) g.updatedAt = a.uploadedAt;
    groups.set(key, g);
  }
  const real = [...groups.values()].filter((g) => g.ids.length >= MIN_SHOTS && g.people.size >= MIN_PEOPLE);
  const places = new Map((await db.place.findMany({ where: { id: { in: real.map((g) => g.areaId) } }, select: { id: true, slug: true, nameAr: true } })).map((p) => [p.id, p]));
  const list = await Promise.all(
    real
      .filter((g) => places.has(g.areaId))
      .map(async (g) => ({
        slug: places.get(g.areaId)!.slug,
        areaName: places.get(g.areaId)!.nameAr,
        scene: g.scene,
        day: g.day,
        shots: g.ids.length,
        people: g.people.size,
        coverUrl: await publicCover({ id: g.ids[g.ids.length - 1] }),
        updatedAt: g.updatedAt,
      })),
  );
  return list.sort((x, y) => (x.day === y.day ? y.shots - x.shots : x.day < y.day ? 1 : -1)).slice(0, take);
}

// One event's page: its shots in the order they were taken, or null when it isn't one (yet).
export async function eventPage(slug: string, scene: string, day: string, now = new Date()) {
  if (!isPhenomenon(scene) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const area = await db.place.findUnique({ where: { slug }, select: { id: true, slug: true, nameAr: true, kind: true, lat: true, lng: true, parentId: true } });
  if (!area) return null;
  const inside = await withDescendants(area.id);
  const range = dayRange(day);
  const candidates = await db.angle.findMany({
    where: {
      ...shownPublic(now),
      placeId: { in: inside },
      AND: [{ OR: [{ capturedAt: range }, { capturedAt: null, uploadedAt: range }] }],
    },
    select: {
      id: true,
      mediaType: true,
      scene: true,
      weather: true,
      weatherTemp: true,
      aiText: true,
      filter: true,
      capturedAt: true,
      uploadedAt: true,
      contributorId: true,
      contributor: { select: { displayName: true } },
      place: { select: { id: true, nameAr: true, slug: true } },
      moment: { select: { code: true, title: true } },
    },
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
  });
  // Only this area's own event: a shot counts where its area is this one.
  const areas = await areasOf(candidates.map((a) => a.place!.id));
  const shots = candidates.filter((a) => phenomenonOf(a.scene, a.weather) === scene && areas.get(a.place!.id) === area.id);
  const people = new Set(shots.map((s) => s.contributorId));
  if (shots.length < MIN_SHOTS || people.size < MIN_PEOPLE) return null;
  return {
    area: { slug: area.slug, name: area.nameAr, lat: area.lat, lng: area.lng },
    scene,
    day,
    people: people.size,
    shots: await Promise.all(
      shots.map(async (s) => ({
        id: s.id,
        video: s.mediaType === "VIDEO",
        filter: s.filter,
        at: s.capturedAt ?? s.uploadedAt,
        line: s.aiText?.replace(/#\S+/g, "").trim() || null,
        weather: s.weather,
        weatherTemp: s.weatherTemp,
        name: s.contributor.displayName,
        place: s.place!.nameAr,
        momentCode: s.moment.code,
        momentTitle: s.moment.title,
        imageUrl: await publicCover(s),
      })),
    ),
  };
}

// A place page's «📅 أحداث صارت هون»: its area's events of the last year.
export function placeEvents(areaId: string, now = new Date()) {
  return findEvents({ since: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), areaId, now, take: 12 });
}

export const eventPath = (e: { slug: string; scene: string; day: string }) => `/e/${encodeURIComponent(e.slug)}/${e.scene}/${e.day}`;
