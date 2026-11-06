// «زاوية الموسم»'s words (src/lib/seasons.ts, 2026-11-06): a hashtag is in the season when one of its
// words is one of the season's — the long tail Zawmo writes counts, look-alikes don't.
// Run: npx tsx tests/seasons.test.ts
import assert from "node:assert/strict";
import { parseCodes, parseWords, seasonWords, tagInSeason } from "../src/lib/seasons";

let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("PASS " + name);
};
const winter = seasonWords(["شتاء", "المطر", "مطر", "غيوم", "ماطرة", "حطب", "ثلج"]);

check("a word of the tag counts", () => {
  for (const t of ["شتاء", "غيوم_ماطرة", "صوت_المطر", "صوبة_حطب", "غيوم_الغروب", "#ثلج"]) assert.ok(tagInSeason(t.replace("#", ""), winter), t);
});
check("look-alikes don't: a seedling, iced coffee, a word that only starts the same", () => {
  for (const t of ["شتلة_زيتون", "مشتل_نباتات", "قهوة_مثلجة", "مثلجات", "مطرقة", "قهوة"]) assert.ok(!tagInSeason(t, winter), t);
});
check("the admin's words: split on spaces and commas, # dropped, no repeats, letters only", () => {
  assert.deepEqual(parseWords("شتاء، مطر #غيوم,مطر  x !!"), ["شتاء", "مطر", "غيوم"]);
});
check("pinned codes: real moment codes, in order, no repeats", () => {
  assert.deepEqual(parseCodes("xk9ggh, FW3FA3 XK9GGH nope 1234567"), ["XK9GGH", "FW3FA3"]);
});
console.log(`${n} checks`);
