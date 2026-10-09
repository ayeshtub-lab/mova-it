// What a moment's shots show, for its search title (src/lib/shot-words.ts): only the shots' own
// #tags, the most shown first (general words last); nothing when the name already says it, nothing
// for a place.
// Run: npx tsx --test tests/shot-words.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { shotWords } from "../src/lib/shot-words";

const farm = ["حبات طازجة #طماطم #زراعة_منزلية", "من الحقل #طماطم #خيار", "#خيار مقرمش", "#فلفل أحمر", null];

test("a name that doesn't say it gets the two most shown things", () => {
  assert.deepEqual(shotWords(farm, "من انتاج مزرعتي", "الخضر"), ["طماطم", "خيار"]);
});

test("nothing when the name already names one of them", () => {
  assert.deepEqual(shotWords(farm, "طماطم بلدي", "الخضر"), []);
  assert.deepEqual(shotWords(["#قهوة_الصباح", "#قهوة_الصباح #بلكونة"], "قهوة الصباح", null), []);
});

test("a place says where, not what; empty words and filler are skipped", () => {
  assert.deepEqual(shotWords(["#بيت_لحم #ورد", "#بيت_لحم #زاومو"], "صباحي", "بيت لحم"), ["ورد"]);
  assert.deepEqual(shotWords(["#fyp #2026", null, "بلا وسوم"], "يومياتي", null), []);
});

test("a word the name already has, however it's spelled, means the name says it", () => {
  assert.deepEqual(shotWords(["#حنان_الام #أمي"], "حنان الأم", null), []);
  assert.deepEqual(shotWords(["#روقان #شاي_بالنعناع"], "شاي وبسكويت", null), []);
  assert.deepEqual(shotWords(["#مطر #خيرات_الشتاء"], "سيول وامطار شتاء", null), []);
  assert.deepEqual(shotWords(["#ورد #نباتات"], "ورد البلكونة", null), []);
});

test("two different things, not one said twice", () => {
  assert.deepEqual(shotWords(["#تين #موسم_التين #سلة"], "آخر صورة", null), ["تين", "سلة"]);
});

test("a general word comes after a telling one", () => {
  assert.deepEqual(shotWords(["#طبيعة #سلحفاة", "#طبيعة"], "تفصيلة صغيرة", null), ["سلحفاة", "طبيعة"]);
});
