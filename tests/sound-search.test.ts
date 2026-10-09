// Search words for the library's sounds (src/lib/sound-search.ts): every sound worth searching for
// gets them by itself — one added later too — a phrase and 1–3 clean tags; a funny line or a
// person's own sound gets none; a verse's, a duaa's or a nasheed's words come with it.
// Run: npx tsx --test tests/sound-search.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { soundSearch } from "../src/lib/sound-search";
import { SOUNDS } from "../src/lib/sounds";

const SEARCHED = ["quran", "spiritual", "wisdom", "nasheed", "nature", "warm", "occasions", "calm", "daf"];

test("every library sound worth searching for has a phrase and clean tags", () => {
  for (const s of SOUNDS.filter((x) => SEARCHED.includes(x.cat))) {
    const found = soundSearch(s.key);
    assert.ok(found, `${s.key} (${s.cat}) has no search words`);
    assert.ok(found.phrase.length >= 5, `${s.key}: phrase`);
    assert.ok(found.tags.length >= 1 && found.tags.length <= 3, `${s.key}: ${found.tags.length} tags`);
    for (const t of found.tags) {
      assert.ok(!/\s|#/.test(t), `${s.key}: tag «${t}» has a space or #`);
      assert.ok(!/[ً-ٰٟ]/.test(t), `${s.key}: tag «${t}» has tashkeel`);
    }
  }
});

test("a verse brings its surah; its words come with it", () => {
  const verse = soundSearch(SOUNDS.find((s) => s.cat === "quran" && s.ar.includes(":"))!.key)!;
  assert.match(verse.phrase, /^مع تلاوة «.+» من سورة /);
  assert.ok(verse.tags[0].startsWith("سورة_"));
  assert.ok(verse.words && verse.words.length > 10, "the verse's own words");
});

test("a funny line, a person's own sound and no sound get nothing", () => {
  for (const s of SOUNDS.filter((x) => x.cat === "funny")) assert.equal(soundSearch(s.key), null, s.key);
  assert.equal(soundSearch("u123abc"), null);
  assert.equal(soundSearch(null), null);
});
