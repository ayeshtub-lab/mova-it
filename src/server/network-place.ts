import data from "@/data/places.json";
import { nearestPlace } from "@/lib/places-client";

// Where the request comes from, as Vercel guesses it from the connection (no permission is
// asked; often only the nearest big town — in Palestine it can say Ramallah for half the
// West Bank). It becomes a town id and the numbers are dropped. Never shown to anyone: it
// only helps «صوّر معك» match, and pre-fills a new moment's place (which its creator can change).
export type Network = { country: string | null; placeId: string | null };

type Raw = { id: string; kind: string; parent: string | null };
const places = (data as unknown as { places: Raw[] }).places;
const byId = new Map(places.map((p) => [p.id, p]));

export function networkFrom(headers: Headers): Network {
  const country = headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const lat = Number(headers.get("x-vercel-ip-latitude"));
  const lng = Number(headers.get("x-vercel-ip-longitude"));
  let placeId = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? nearestPlace(places as never, lat, lng) : null;
  // A town, not a street: a neighbourhood counts as its city.
  const p = placeId ? byId.get(placeId) : null;
  if (p?.kind === "NEIGHBOURHOOD" && p.parent) placeId = p.parent;
  return { country, placeId };
}
