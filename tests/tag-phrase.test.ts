// A hashtag page's words for search results (src/lib/tag-phrase.ts, 2026-10-25): nothing said twice.
// Run: npx tsx tests/tag-phrase.test.ts
import assert from "node:assert/strict";
import { tagPhrase } from "../src/lib/tag-phrase";

let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("PASS " + name);
};

check("Arabic: the tag already says «صور … حقيقية»", () => {
  assert.equal(tagPhrase("صور_قهوة_حقيقية", "ar"), "صور قهوة حقيقية");
  assert.equal(tagPhrase("صوره_طماطم", "ar"), "صوره طماطم حقيقية");
  assert.equal(tagPhrase("صور_حلويات_حقيقية", "ar"), "صور حلويات حقيقية");
});
check("Arabic: a plain tag gets both", () => {
  assert.equal(tagPhrase("قهوة_المساء", "ar"), "صور قهوة المساء حقيقية");
  assert.equal(tagPhrase("صورية", "ar"), "صور صورية حقيقية", "a word that only starts with «صور» is not «صور»");
});
check("English: no «photos» or «real» twice", () => {
  assert.equal(tagPhrase("sunset", "en"), "Real sunset photos");
  assert.equal(tagPhrase("real_coffee_photos", "en"), "real coffee photos");
  assert.equal(tagPhrase("coffee_pictures", "en"), "Real coffee pictures");
});
console.log(`${n} checks`);
