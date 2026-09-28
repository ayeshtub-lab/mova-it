// On the phone only: turns a photo's GPS position into a Zawmo place id (a village, a
// city, a neighbourhood). The coordinates are used here and dropped; only the place id is
// sent. The list (src/data/places.json, ~40 KB zipped) loads the first time it's needed.
// Also used by tests (plain functions, no browser APIs).

type Raw = { id: string; kind: string; cc: string; parent: string | null; lat?: number; lng?: number; pop?: number | null };

const LOCALITY = new Set(["CITY", "TOWN", "VILLAGE", "CAMP"]);
// Palestine has every village: the nearest one within a few km is the place. Elsewhere the
// list has big cities only, so a city covers its surroundings.
const MAX_KM_PS = 6;
const MAX_KM_OTHER = 30;
const MAX_KM_NEIGHBOURHOOD = 2.5;
const CENTRE_KM = 0.3;

let cache: Promise<Raw[]> | null = null;
const load = () => (cache ??= import("@/data/places.json").then((m) => (m.default as unknown as { places: Raw[] }).places));

function km(lat1: number, lng1: number, lat2: number, lng2: number) {
  const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(lat2 - lat1, x) * 111.2;
}

// A place is a centre point, but a city spreads further than a village: a photo at Ramallah's
// al-Manara is nearer the centre of a small camp inside the city than the city's own centre.
// So bigger places reach further (≈ 0.5 km + 0.012·√population: Ramallah ~3 km, a village ~1 km).
// A camp is the opposite: many people on very little ground, so it covers only its own streets
// (a photo in Artas must not become «مخيم الدهيشة» next door). Unknown population = a village.
// Capped at 8 km, so a giant (Cairo) does not swallow its neighbour city (Giza).
const reach = (p: Raw) => (p.kind === "CAMP" ? 0.4 : Math.min(8, 0.5 + 0.012 * Math.sqrt(p.pop ?? 2500)));

export function nearestPlace(places: Raw[], lat: number, lng: number): string | null {
  let best: Raw | null = null;
  let bestScore = Infinity;
  let bestKm = Infinity;
  let closest: Raw | null = null;
  let closestKm = Infinity;
  for (const p of places) {
    if (!LOCALITY.has(p.kind) || p.lat == null || p.lng == null) continue;
    const d = km(lat, lng, p.lat, p.lng);
    if (d < closestKm) {
      closestKm = d;
      closest = p;
    }
    const score = d - reach(p);
    if (score < bestScore) {
      bestScore = score;
      bestKm = d;
      best = p;
    }
  }
  // Right at a place's centre (inside a camp, in a village's core): that place, whatever its size.
  if (closest && closestKm <= CENTRE_KM) {
    best = closest;
    bestKm = closestKm;
  }
  if (!best || bestKm > (best.cc === "PS" ? MAX_KM_PS : MAX_KM_OTHER)) return null;

  // A neighbourhood of that same city, if the photo is right in it.
  let hood: Raw | null = null;
  let hoodKm = MAX_KM_NEIGHBOURHOOD;
  for (const p of places) {
    if (p.kind !== "NEIGHBOURHOOD" || p.parent !== best.id || p.lat == null || p.lng == null) continue;
    const d = km(lat, lng, p.lat, p.lng);
    if (d < hoodKm) {
      hoodKm = d;
      hood = p;
    }
  }
  return (hood ?? best).id;
}

export async function placeAt(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  try {
    return nearestPlace(await load(), lat, lng);
  } catch {
    return null;
  }
}
