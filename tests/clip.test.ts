// What search engines get (src/lib/clip.ts): hashtags read as plain words, descriptions cut at a
// word. Run: npx tsx --test tests/clip.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, plain } from "../src/lib/clip";

test("a hashtag reads as its words; the rest is untouched", () => {
  assert.equal(plain("اجمل باقة #زهور في محافظة رام الله"), "اجمل باقة زهور في محافظة رام الله");
  assert.equal(plain("#بر_الوالدين #زاومو"), "بر الوالدين زاومو");
  assert.equal(plain("Sunset #golden_hour in #Jerusalem"), "Sunset golden hour in Jerusalem");
  assert.equal(plain("عرس قبل 19 سنة — زفة وطربوش ودبكة"), "عرس قبل 19 سنة — زفة وطربوش ودبكة");
  assert.equal(plain("رقم # وحده"), "رقم # وحده", "a lone # is not a tag");
});

test("a description has no «#» and is cut at a word", () => {
  const text = clip(`من #زاومو وثق #لحظاتك الزراعية ${"من البذرة وحتى الحصاد ".repeat(12)}`);
  assert.ok(!text.includes("#"));
  assert.ok(text.length <= 159);
  assert.ok(text.endsWith("…"));
});
