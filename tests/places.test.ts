// Unit test for places (src/lib/places-client.ts, src/lib/arabic.ts): a photo's position on
// the phone becomes the right town, camp or city, and every way of writing a name matches.
// Run: npx tsx tests/places.test.ts — no network, no database.
import assert from "node:assert/strict";
import data from "../src/data/places.json";
import { normalize, slugOf, withoutAl } from "../src/lib/arabic";
import { nearestPlace } from "../src/lib/places-client";
import { networkFrom } from "../src/server/network-place";

type P = { id: string; ar: string; parent: string | null; kind: string; cc: string };
const places = (data as unknown as { places: P[] }).places;
const out: string[] = [];
const check = (name: string, fn: () => void) => {
  fn();
  out.push("PASS " + name);
};
const nameAt = (lat: number, lng: number) => places.find((p) => p.id === nearestPlace(places as never, lat, lng))?.ar ?? null;

check("a photo's position → the right town, camp or city (Palestine)", () => {
  const cases: [string, number, number][] = [
    ["رام الله", 31.9038, 35.2034], // al-Manara, next to a small camp's centre
    ["البيرة", 31.91, 35.216],
    ["بيت لحم", 31.7043, 35.2078], // Church of the Nativity
    ["بيت ساحور", 31.7015, 35.2261],
    ["بيت جالا", 31.715, 35.187],
    ["أرطاس", 31.6897, 35.1869], // next to Dheisheh camp
    ["مخيم الدهيشة", 31.6942, 35.1845],
    ["نابلس", 32.2211, 35.2544],
    ["مخيم بلاطة", 32.2067, 35.2868],
    ["الخليل", 31.5244, 35.1107],
    ["غزة", 31.523, 34.443],
    ["مخيم الشاطئ", 31.5325, 34.4457],
    ["جنين", 32.4607, 35.2962],
    ["القدس", 31.7815, 35.2303],
  ];
  for (const [want, lat, lng] of cases) assert.equal(nameAt(lat, lng), want, `${lat},${lng}`);
});

check("… and in other Arab countries (a capital's district is a neighbourhood of it)", () => {
  const cases: [string, number, number][] = [
    ["عمان", 31.962, 35.91],
    ["الرياض", 24.7136, 46.6753],
    ["جدة", 21.5433, 39.1728],
    ["الجيزة", 30.0131, 31.2089], // not swallowed by Cairo
    ["بيروت", 33.8938, 35.5018],
    ["الدوحة", 25.2854, 51.531],
  ];
  cases.push(["القاهرة", 30.0444, 31.2357]);
  // The city itself or one of its neighbourhoods («رأس بيروت» is Beirut).
  for (const [want, lat, lng] of cases) {
    const got = places.find((p) => p.id === nearestPlace(places as never, lat, lng));
    const parent = places.find((p) => p.id === got?.parent);
    assert.ok(got?.ar === want || (got?.kind === "NEIGHBOURHOOD" && parent?.ar === want), `${lat},${lng} → ${got?.ar}`);
  }
});

check("outside the Arab world, or no real position → no place", () => {
  assert.equal(nameAt(41.0082, 28.9784), null); // Istanbul
  assert.equal(nameAt(32.0853, 34.7818), null); // Tel Aviv: not in the list, and far from any place in it
  assert.equal(nearestPlace(places as never, 0, 0), null);
});

check("the list: every locality has a parent, names are clean, no settlements", () => {
  const ids = new Set(places.map((p) => p.id));
  for (const p of places) {
    if (p.kind !== "COUNTRY") assert.ok(p.parent && ids.has(p.parent), `${p.id} parent`);
    if (p.kind !== "COUNTRY") assert.ok(!/[ً-ٟ]/.test(p.ar), `diacritics in ${p.ar}`);
  }
  assert.ok(places.filter((p) => p.cc === "PS" && p.kind !== "GOVERNORATE" && p.kind !== "COUNTRY").length >= 500, "all of Palestine");
  assert.equal(places.filter((p) => p.kind === "GOVERNORATE").length, 16);
});

check("names match however they're written", () => {
  const same = (a: string, b: string) => assert.equal(normalize(a), normalize(b), `${a} ≠ ${b}`);
  same("بيت لحم", "بيتلحم");
  same("بيت لحم", "بًيَتٌ لَحًمً");
  same("أرطاس", "ارطاس");
  same("قلقيلية", "قلقيليه");
  same("بيت-لحم", "بيت لحم");
  assert.equal(withoutAl(normalize("الخضر")), normalize("خضر"));
  assert.equal(slugOf("بيت لحم"), "بيت-لحم");
  assert.equal(slugOf("رام الله والبيرة"), "رام-الله-والبيرة");
});

check("the network's town (Vercel's guess): a town id, a neighbourhood counts as its city, nothing without numbers", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.deepEqual(networkFrom(h({ "x-vercel-ip-country": "ps", "x-vercel-ip-latitude": "31.7043", "x-vercel-ip-longitude": "35.2078" })), { country: "PS", placeId: "ps-452240" });
  const beirut = places.find((p) => p.ar === "بيروت")!;
  assert.equal(networkFrom(h({ "x-vercel-ip-latitude": "33.8938", "x-vercel-ip-longitude": "35.5018" })).placeId, beirut.id, "Ras Beirut → Beirut");
  assert.deepEqual(networkFrom(h({})), { country: null, placeId: null });
});

console.log(out.join("\n"));
