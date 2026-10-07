import { db } from "@/lib/db";
import type { WeatherKind } from "@/lib/weather";

// The weather where and when a shot was taken: «🌧️ مطر · 12°» under it, words for search engines,
// and later what gathers a rainy or snowy day's shots of one town together.
// Source: MET Norway's forecast (api.met.no) — free also for commercial use, credited on the
// pages (CC BY 4.0; Open-Meteo's free plan is for non-commercial use only). It knows the
// current hour onwards, not the past, so only a shot taken shortly before it is checked gets
// its weather; one taken longer ago (an old photo from the gallery) gets none. The place is a
// town's centre (Place.lat/lng), never a person's position.

const API = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
// MET Norway asks every app to say who it is.
const USER_AGENT = "zawmo.com info@zawmo.com";
// Shots uploaded within this long are checked (the cron runs every 10 minutes)…
const FRESH_MS = 3 * 60 * 60 * 1000;
// …and the forecast hour must be this close to when the shot was taken.
const NEAR_MS = 75 * 60 * 1000;

// MET Norway's symbol («lightrainshowers_day», «heavysnowandthunder»…) as one of our kinds.
export function weatherKind(symbol: string): WeatherKind | null {
  const night = symbol.endsWith("_night");
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return "thunder";
  if (s.includes("sleet")) return "sleet";
  if (s.includes("snow")) return s.startsWith("light") ? "lightsnow" : s.startsWith("heavy") ? "heavysnow" : "snow";
  if (s.includes("rain")) return s.startsWith("light") ? "lightrain" : s.startsWith("heavy") ? "heavyrain" : "rain";
  if (s === "fog") return "fog";
  if (s === "cloudy") return "cloudy";
  if (s === "partlycloudy") return "partlycloudy";
  if (s === "fair") return night ? "fair-night" : "fair";
  if (s === "clearsky") return night ? "clear-night" : "clear";
  return null;
}

export type Hour = { time: string; data: { instant: { details: { air_temperature?: number } }; next_1_hours?: { summary: { symbol_code: string } } } };

// The forecast hours for a point (rounded to ~1 km, as MET Norway asks: fewer, cacheable calls).
export async function forecast(lat: number, lng: number): Promise<Hour[] | null> {
  const url = `${API}?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { properties?: { timeseries?: Hour[] } } | null;
  return body?.properties?.timeseries ?? null;
}

// The weather at `at` from those hours, or null when none is close enough.
export function weatherAt(hours: Hour[], at: Date) {
  let best: Hour | null = null;
  for (const h of hours) {
    if (!h.data.next_1_hours) continue;
    if (!best || Math.abs(Date.parse(h.time) - at.getTime()) < Math.abs(Date.parse(best.time) - at.getTime())) best = h;
  }
  if (!best || Math.abs(Date.parse(best.time) - at.getTime()) > NEAR_MS) return null;
  const kind = weatherKind(best.data.next_1_hours!.summary.symbol_code);
  return kind ? { kind, temp: best.data.instant.details.air_temperature ?? null } : null;
}

// Gives fresh shots with a place their weather — a few per run (src/app/api/cron/branded).
// Each shot is checked once: after a failed call it is tried again on the next runs, and once
// it is older than FRESH_MS it is left without (the service has no past). Returns how many got one.
export async function stampWeather(limit = 40, now = new Date()) {
  const shots = await db.angle.findMany({
    where: {
      status: "READY",
      weatherCheckedAt: null,
      uploadedAt: { gte: new Date(now.getTime() - FRESH_MS) },
      OR: [{ placeId: { not: null } }, { moment: { placeId: { not: null } } }],
    },
    select: { id: true, capturedAt: true, uploadedAt: true, place: { select: { lat: true, lng: true } }, moment: { select: { place: { select: { lat: true, lng: true } } } } },
    orderBy: { uploadedAt: "asc" },
    take: limit,
  });
  // (updateMany: a shot deleted meanwhile is simply skipped, never an error for the rest.)
  const calls = new Map<string, Promise<Hour[] | null>>();
  let stamped = 0;
  for (const s of shots) {
    const at = s.capturedAt ?? s.uploadedAt;
    const place = s.place ?? s.moment.place;
    // Taken too long ago for a forecast to say (an old photo): none, and not asked again.
    if (!place || now.getTime() - at.getTime() > FRESH_MS) {
      await db.angle.updateMany({ where: { id: s.id }, data: { weatherCheckedAt: now } });
      continue;
    }
    const key = `${place.lat.toFixed(2)},${place.lng.toFixed(2)}`;
    if (!calls.has(key)) calls.set(key, forecast(place.lat, place.lng));
    const hours = await calls.get(key)!;
    if (!hours) continue; // the service didn't answer: the next run tries again (until FRESH_MS)
    const w = weatherAt(hours, at);
    await db.angle.updateMany({ where: { id: s.id }, data: { weather: w?.kind ?? null, weatherTemp: w?.temp ?? null, weatherCheckedAt: now } });
    if (w) stamped++;
  }
  return stamped;
}
