// «📝» the words of the library's spoken sounds (src/lib/lyrics.json, made and checked by ear
// by scripts/make-lyrics.mts). Run: npx tsx --test tests/lyrics.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import data from "../src/lib/lyrics.json";
import { lineAt, lyricsOf, lyricTimes, wordsMark } from "../src/lib/lyrics";
import { isQuran, SOUNDS, soundByKey } from "../src/lib/sounds";
import { probeDuration } from "../src/server/ffmpeg";

const keys = Object.keys(data);

test("every sound with words is in the library, and every verse and remembrance has words", () => {
  for (const key of keys) assert.ok(soundByKey(key), `${key} is not a library sound`);
  for (const s of SOUNDS) if (s.cat === "quran" || s.cat === "spiritual" || s.cat === "wisdom") assert.ok(lyricsOf(s.key), `${s.key} has no words`);
  for (const key of keys) assert.equal(!!lyricsOf(key)?.quran, isQuran(soundByKey(key)), `${key}: verse flag`);
});

test("lines run from the start to the end of the sound, in order, without gaps", async () => {
  for (const key of keys) {
    const { lines } = lyricsOf(key)!;
    assert.equal(lines[0][0], 0, `${key} starts at 0`);
    for (const [i, [s, e, text]] of lines.entries()) {
      assert.ok(e > s && text.trim(), `${key} line ${i + 1}`);
      if (i) assert.equal(s, lines[i - 1][1], `${key} line ${i + 1} follows the one before`);
    }
    // (The sound's real length, read from its file.)
    assert.ok(Math.abs(lines[lines.length - 1][1] - (await probeDuration(`public/sounds/${key}.mp3`))!) < 0.15, `${key} ends with its sound`);
  }
});

test("the line heard at a moment; looped sounds show again, verses once", () => {
  const verse = lyricsOf("q15")!;
  assert.match(lineAt(verse, 0.5)!, /قُلْ هُوَ/);
  assert.equal(lineAt(verse, 999), null);
  assert.ok(lyricTimes(verse, 60).every((l) => l.at.length === 1));
  const duaa = lyricsOf("s14")!;
  const length = duaa.lines[duaa.lines.length - 1][1];
  assert.equal(lyricTimes(duaa, length * 2 + 1)[0].at.length, 3);
  assert.ok(lyricTimes(duaa, 5).every((l) => l.at.every(([s, e]) => s < 5 && e <= 5)));
});

test("a video's fingerprint changes only for sounds with words", () => {
  assert.deepEqual(wordsMark("s14"), ["📝"]);
  assert.deepEqual(wordsMark("s14", false), []);
  assert.deepEqual(wordsMark("n01"), []);
  assert.deepEqual(wordsMark(null), []);
});
