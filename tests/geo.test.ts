// Rough place from Vercel's IP headers. Run: npx tsx --test tests/geo.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { placeFromHeaders } from "../src/lib/geo";

const h = (m: Record<string, string>) => new Headers(m);

test("country code and decoded city", () => {
  assert.deepEqual(placeFromHeaders(h({ "x-vercel-ip-country": "SA", "x-vercel-ip-city": "Riyadh" })), { country: "SA", city: "Riyadh" });
  assert.deepEqual(placeFromHeaders(h({ "x-vercel-ip-country": "ps", "x-vercel-ip-city": "Ramallah%20Al%20Bireh" })), { country: "PS", city: "Ramallah Al Bireh" });
});

test("nothing usable → nothing kept", () => {
  assert.deepEqual(placeFromHeaders(h({})), { country: null, city: null });
  assert.deepEqual(placeFromHeaders(h({ "x-vercel-ip-country": "XYZ", "x-vercel-ip-city": "Nowhere" })), { country: null, city: null });
  assert.deepEqual(placeFromHeaders(h({ "x-vercel-ip-country": "KW", "x-vercel-ip-city": "%E0%A4%A" })), { country: "KW", city: null });
});
