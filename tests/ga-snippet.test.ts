// The Google Analytics snippet (src/app/GoogleAnalytics.tsx) and «who just became a member»
// (src/server/google.ts newMember). Run: npx tsx --test tests/ga-snippet.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { GA_SNIPPET } from "../src/app/GoogleAnalytics";
import { newMember } from "../src/server/google";

// Runs the snippet as a browser would, at `href` with `cookie`, and returns what reached gtag.
function run(href: string, cookie = "", referrer = "") {
  const calls: unknown[][] = [];
  const doc = { referrer, cookie };
  const win = { dataLayer: [] as unknown[] };
  const fn = new Function("window", "document", "location", "dataLayer", `${GA_SNIPPET}; return dataLayer;`);
  const layer = fn(win, doc, new URL(href), win.dataLayer) as IArguments[];
  for (const a of layer) calls.push(Array.from(a));
  return { calls, cookie: doc.cookie };
}

const config = (calls: unknown[][]) => calls.find((c) => c[0] === "config")?.[2] as Record<string, unknown>;

test("a shared photo's link tells GA where the visit came from", () => {
  const { calls } = run("https://zawmo.com/m/8U3GUA?src=share-photo#angle-x");
  const loc = new URL(config(calls).page_location as string);
  assert.equal(loc.searchParams.get("utm_source"), "share-photo");
  assert.equal(loc.searchParams.get("utm_medium"), "share");
  assert.equal(loc.hash, "#angle-x");
  const ad = new URL(config(run("https://zawmo.com/start?src=tiktok-house").calls).page_location as string);
  assert.equal(ad.searchParams.get("utm_medium"), "link");
});

test("nothing changes without our tag, or when utm is already there", () => {
  assert.equal(config(run("https://zawmo.com/tag/قهوة").calls).page_location, undefined);
  assert.equal(config(run("https://zawmo.com/?src=wa&utm_source=fb").calls).page_location, undefined);
  assert.equal(config(run("https://zawmo.com/", "", "https://accounts.google.com/").calls).ignore_referrer, true);
});

test("sign_up once, only after a real join", () => {
  const joined = run("https://zawmo.com/", "a=1; zw_joined=1");
  assert.ok(joined.calls.some((c) => c[0] === "event" && c[1] === "sign_up"));
  assert.match(joined.cookie, /zw_joined=; Max-Age=0/);
  assert.ok(!run("https://zawmo.com/", "a=1").calls.some((c) => c[1] === "sign_up"));
});

test("a new member: a guest who joined, or a fresh account — not someone signing back in", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const guest = { id: "g1", isGuest: true, googleSub: null };
  assert.equal(newMember(guest, { id: "g1", createdAt: new Date("2026-10-01") }, now), true);
  assert.equal(newMember(null, { id: "n1", createdAt: new Date(now - 5_000) }, now), true);
  assert.equal(newMember(null, { id: "m1", createdAt: new Date("2026-10-01") }, now), false);
  assert.equal(newMember(guest, { id: "m1", createdAt: new Date("2026-10-01") }, now), false, "a guest signing into an old account");
});
