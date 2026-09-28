// Unit test for «صوّر معك» scoring (matchScore in src/server/join.ts): the lens seeing the same
// subject is enough on its own; places known for sure and far apart always win; the rest needs
// a name, a sign or the same scene backed by place.
// Run: npx tsx tests/match.test.ts — no network, no database.
import "./env";
import assert from "node:assert/strict";
import { matchScore } from "../src/server/join";

const out: string[] = [];
const check = (name: string, fn: () => void) => {
  fn();
  out.push("PASS " + name);
};
const now = Date.now();
const H = 3600 * 1000;
const me = (o: Partial<Parameters<typeof matchScore>[0]> = {}) => ({ title: "وردة", seen: null, scene: "nature", at: now, precise: null, network: "ps-502780", ...o });
const them = (o: Partial<Parameters<typeof matchScore>[1]> = {}) => ({ title: "زنبق", seen: [], scenes: [{ scene: "nature", at: now - 1 * H }], precise: ["ps-452270"], network: ["ps-502780"], ...o });

check("the same lily from a third account (different name, network-only place): matches when the lens sees it", () => {
  assert.equal(matchScore(me(), them()).score, 0, "without the lens: only a broad scene, no match");
  assert.ok(matchScore(me(), them({ visual: "same" })).score > 0, "with the lens: match");
});

check("the lens alone is enough, even with no place at all and hours apart", () => {
  assert.ok(matchScore(me({ network: null }), them({ precise: [], network: [], visual: "same", scenes: [{ scene: null, at: now - 20 * H }] })).score > 0);
});

check("but never when both places are known for sure and far apart (Jenin vs Bethlehem)", () => {
  const r = matchScore(me({ precise: "ps-452240" }), them({ precise: ["ps-10180"], visual: "same" }));
  assert.equal(r.score, 0);
  assert.equal(r.excluded, true);
});

check("broad on purpose: two DIFFERENT flowers nearby match («مش لازم 100»); a flower and a car don't", () => {
  assert.ok(matchScore(me(), them({ visual: "similar" })).score > 0, "similar + same region");
  assert.equal(matchScore(me({ scene: "street" }), them({ visual: "no", scenes: [{ scene: "street", at: now }] , precise: [], network: [] })).score, 0, "different kinds");
});

check("…but «similar» stays within one region: a flower in Riyadh is not Artas's lily", () => {
  const riyadh = "gn-108410";
  assert.equal(matchScore(me({ network: riyadh }), them({ visual: "similar", precise: [], network: ["ps-452300"] })).score, 0);
  assert.ok(matchScore(me({ network: riyadh }), them({ visual: "same", precise: [], network: ["ps-452300"] })).score > 0, "the exact same thing still matches");
});

check("a name only counts within hours, not a day later", () => {
  assert.ok(matchScore(me({ title: "زنبق" }), them()).score > 0);
  assert.equal(matchScore(me({ title: "زنبق" }), them({ scenes: [{ scene: "nature", at: now - 20 * H }] })).score, 0);
});

console.log(out.join("\n"));
