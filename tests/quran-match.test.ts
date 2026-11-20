// «📖 سور من القرآن» (src/lib/quran-match.ts): the verse a story quotes, as people type it, and the
// verses that fit in 40 seconds. Run: npx tsx --test tests/quran-match.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { namedSurah, normalizeArabic, plainName, startVerse, verseRange, versesWithin } from "../src/lib/quran-match";

// A few verses as the text source writes them (Tanzil's «simple-clean»).
const VERSES = [
  { surah: 2, ayah: 253, text: "تلك الرسل فضلنا بعضهم على بعض منهم من كلم الله ورفع بعضهم درجات" },
  { surah: 2, ayah: 254, text: "يا أيها الذين آمنوا أنفقوا مما رزقناكم من قبل أن يأتي يوم لا بيع فيه ولا خلة ولا شفاعة والكافرون هم الظالمون" },
  { surah: 2, ayah: 255, text: "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض" },
  { surah: 2, ayah: 267, text: "يا أيها الذين آمنوا أنفقوا من طيبات ما كسبتم ومما أخرجنا لكم من الأرض" },
  { surah: 2, ayah: 270, text: "وما أنفقتم من نفقة أو نذرتم من نذر فإن الله يعلمه وما للظالمين من أنصار" },
];
const NAMES = [
  { surah: 2, name: "سُورَةُ البَقَرَةِ" },
  { surah: 4, name: "سُورَةُ النِّسَاءِ" },
  { surah: 114, name: "سُورَةُ النَّاسِ" },
];

test("the letters are compared one way, whatever the marks and the hamza", () => {
  assert.equal(normalizeArabic("سُورَةُ البَقَرَةِ"), "سوره البقره");
  assert.equal(normalizeArabic("إِنَّ ٱللَّهَ"), "ان الله");
  assert.equal(normalizeArabic("الظالمون( ٢٥٤)"), "الظالمون");
  assert.equal(plainName("سُورَةُ البَقَرَةِ"), "سورة البقرة");
});

test("the surah its story names — the longest name, never a shorter one inside it", () => {
  assert.equal(namedSurah("سورة البقرة الجزء الثالث", NAMES), 2);
  assert.equal(namedSurah("من سوره النساء الايه ١", NAMES), 4);
  assert.equal(namedSurah("سورة الناس", NAMES), 114);
  assert.equal(namedSurah("صورة قهوة الصبح", NAMES), null);
});

test("the verse its quoted words start in — typos and a wrong number typed in included", () => {
  // His 20/11 story: «الاية ٢٥٣» typed, but the words quoted are 254's («امنو», «ايه» as typed).
  const note = "سورة البقرة جزء ٣ الاية ٢٥٣ يا ايه الذين امنو انفقوا مما رزقناكم من قبل أن يأتي يوم لا بيع فيه";
  assert.equal(startVerse(note, VERSES)?.ayah, 254);
  assert.equal(startVerse("وما انفقتم من نفقة او نذرتم من نذر فإن الله يعلمه ص٤٦", VERSES)?.ayah, 270);
  assert.equal(startVerse("الله لأ إله إلا هو الحي القيوم", VERSES)?.ayah, 255);
});

test("words said in more than one verse never decide it alone", () => {
  // «يا أيها الذين آمنوا أنفقوا» opens both 254 and 267: only what follows tells them apart.
  assert.equal(startVerse("يا أيها الذين آمنوا أنفقوا", VERSES), null);
  assert.equal(startVerse("يا أيها الذين آمنوا أنفقوا من طيبات ما كسبتم", VERSES)?.ayah, 267);
  assert.equal(startVerse("صورة قهوة الصبح على البلكونة", VERSES), null);
});

test("whole verses within 40 seconds — the first always, never cut, never past the surah", () => {
  const t = [
    { ayah: 1, start: 0, end: 15_000 },
    { ayah: 2, start: 15_000, end: 30_000 },
    { ayah: 3, start: 30_000, end: 45_000 },
    { ayah: 4, start: 45_000, end: 120_000 },
  ];
  assert.deepEqual(versesWithin(t, 1), { from: 1, to: 2, start: 0, end: 30_000 });
  assert.deepEqual(versesWithin(t, 3), { from: 3, to: 3, start: 30_000, end: 45_000 }, "4 would pass 40 s");
  assert.deepEqual(versesWithin(t, 4), { from: 4, to: 4, start: 45_000, end: 120_000 }, "a long verse is whole");
  assert.equal(versesWithin(t, 9), null);
  assert.equal(verseRange(270, 271), "٢٧٠–٢٧١");
  assert.equal(verseRange(254, 254), "٢٥٤");
});
