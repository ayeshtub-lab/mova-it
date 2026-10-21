// Unit test for the language in the address (src/proxy.ts + src/i18n/config.ts, 2026-10-21):
// /en/… is the English page (the plain page, told «en»), kept out of Google until opened; a plain
// address is always Arabic for Google; someone who chose English is sent to the /en address; the
// API is never redirected. Run: npx tsx tests/locale-proxy.test.ts
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { enIndexable, enPhase1, inLocale, LOCALE_HEADER, PATH_HEADER } from "../src/i18n/config";

let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("PASS " + name);
};
const req = (path: string, { cookie, method = "GET" }: { cookie?: string; method?: string } = {}) =>
  new NextRequest(`https://zawmo.com${path}`, { method, headers: { host: "zawmo.com", ...(cookie ? { cookie } : {}) } });
// What the page is told (Next passes request headers on as x-middleware-request-*).
const told = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

check("inLocale: both ways, the home page too", () => {
  assert.equal(inLocale("/m/ABC234", "en"), "/en/m/ABC234");
  assert.equal(inLocale("/en/m/ABC234", "ar"), "/m/ABC234");
  assert.equal(inLocale("/en/m/ABC234", "en"), "/en/m/ABC234");
  assert.equal(inLocale("/", "en"), "/en");
  assert.equal(inLocale("/en", "ar"), "/");
  assert.equal(inLocale("/english-page", "ar"), "/english-page", "«/english…» is not «/en/»");
});

check("/en/m/X: the plain page, told «en», kept out of Google, the visitor kept in English", () => {
  const res = proxy(req("/en/m/ABC234?src=x"));
  assert.equal(res.headers.get("x-middleware-rewrite"), "https://zawmo.com/m/ABC234?src=x");
  assert.equal(told(res, LOCALE_HEADER), "en");
  assert.equal(told(res, PATH_HEADER), "/en/m/ABC234?src=x");
  if (!enIndexable("/m/ABC234")) assert.equal(res.headers.get("x-robots-tag"), "noindex, follow");
  assert.match(res.headers.get("set-cookie") ?? "", /lang=en/);
});

check("/en alone: the English home page", () => {
  const res = proxy(req("/en"));
  assert.equal(res.headers.get("x-middleware-rewrite"), "https://zawmo.com/");
  assert.equal(told(res, LOCALE_HEADER), "en");
});

check("a plain address without a choice: Arabic, no redirect, no noindex (as Google sees it)", () => {
  const res = proxy(req("/m/ABC234"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
  assert.equal(told(res, LOCALE_HEADER), "ar");
  assert.equal(res.headers.get("x-robots-tag"), null);
});

check("a plain address for someone who chose English: sent to its /en address", () => {
  const res = proxy(req("/m/ABC234?src=x", { cookie: "lang=en" }));
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "https://zawmo.com/en/m/ABC234?src=x");
});

check("…and someone who chose Arabic stays on the plain address", () => {
  const res = proxy(req("/m/ABC234", { cookie: "lang=ar" }));
  assert.equal(res.headers.get("location"), null);
  assert.equal(told(res, LOCALE_HEADER), "ar");
});

check("the API and sign-in are never redirected, nor told a language", () => {
  for (const path of ["/api/likes", "/auth/google"]) {
    const res = proxy(req(path, { cookie: "lang=en" }));
    assert.equal(res.headers.get("location"), null, path);
    assert.equal(told(res, LOCALE_HEADER), null, path);
  }
});

check("a form posted from a plain page is not redirected", () => {
  const res = proxy(req("/m/ABC234", { cookie: "lang=en", method: "POST" }));
  assert.equal(res.headers.get("location"), null);
});

check("a visitor can't set the language header themselves", () => {
  const r = new NextRequest("https://zawmo.com/m/ABC234", { headers: { host: "zawmo.com", [LOCALE_HEADER]: "en" } });
  assert.equal(told(proxy(r), LOCALE_HEADER), "ar");
});

check("phase 1's English pages: home, moments, film parts, shots — nothing else", () => {
  for (const yes of ["/", "/m/ABC234", "/m/ABC234/film/3", "/m/ABC234/a/cmuqpie73000004jp831z7qis", "/m/ABC234?src=x"]) assert.ok(enPhase1(yes), yes);
  for (const no of ["/discover", "/u/abc", "/tag/x", "/p/x", "/m/ABC234/film", "/m/abc234", "/inbox", "/en/m/ABC234"]) assert.ok(!enPhase1(no), no);
});

console.log(`${n} checks`);
