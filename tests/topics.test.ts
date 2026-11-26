// What a photo is about (src/lib/topics.ts, «📸 ضيف صورك» 2026-11-26), from its search title and
// scene — the mix-ups seen when three members' photos were sorted by hand on 26/11.
// Run: npx tsx tests/topics.test.ts
import assert from "node:assert/strict";
import { TOPICS, topicByKey, topicOf } from "../src/lib/topics";

let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("PASS " + name);
};
const of = (aiTitle: string | null, scene: string | null = null) => topicOf({ aiTitle, scene });

check("the plain cases", () => {
  assert.equal(of("صور فنجان قهوة حقيقي برغوة كثيفة في البيت", "food"), "coffee");
  assert.equal(of("صور حلويات حقيقية كنافة بالجبنة والفستق", "food"), "sweets");
  assert.equal(of("قطة صغيرة بيضاء ورمادية لطيفة في البيت", "pets"), "animals");
  assert.equal(of("الليل والقمر القمر بين الغيوم في السماء", "sky"), "moon");
  assert.equal(of("صور ازهار جميلة ورد جوري أحمر في الحديقة", "nature"), "plants");
  assert.equal(of("وجبة شاورما دجاج مع بطاطس مقلية", "food"), "food");
  assert.equal(of("نار الحطب المشتعلة في مدفأة الشتاء", "other"), "winter");
});

check("the 26/11 mix-ups", () => {
  assert.equal(of("قطع دجاج متبل مشوي على شبك الفحم", "food"), "food", "«قطع» is not a cat");
  assert.equal(of("صور اجواء الشتاء وقطرات المطر على زجاج النافذة", "rain"), "winter", "«قطرات» is not a cat");
  assert.equal(of("زهرة عباد الشمس صفراء بين أوراق النباتات", "nature"), "plants", "a sunflower is not the sky");
  assert.equal(of("سماء الغروب باللون الوردي وظلال الأشجار", "sunset"), "sky", "a sunset behind trees is the sky");
  assert.equal(of("لوحة فنية مجسمة لقطة بأشكال هندسية ملونة", "pets"), "art", "a painting of a cat is art");
  assert.equal(of("صور قهوة حقيقية مع بسكويت الشاي", "food"), "coffee", "coffee with biscuits is coffee");
  assert.equal(of("صور حلويات حقيقية مع كاسات شاي في البيت", "food"), "sweets", "sweets with tea are sweets");
});

check("no words: the scene, else «misc»", () => {
  assert.equal(of(null, "pets"), "animals");
  assert.equal(of(null, "sunset"), "sky");
  assert.equal(of(null, "other"), "misc");
  assert.equal(of("مستحضرات تجميل ومكياج وأحمر خدود ملونة", "other"), "misc");
});

check("every topic has a name for its moments and a fallback", () => {
  for (const t of TOPICS) assert.ok(t.title && t.titleEn && t.name instanceof RegExp, t.key);
  assert.equal(topicByKey("nonsense").key, "misc");
  assert.ok(topicByKey("plants").name.test("خضار الحاكورة"));
  assert.ok(topicByKey("sky").name.test("غيوم وسماء جميلة"));
});

console.log(`\n${n} checks passed`);
