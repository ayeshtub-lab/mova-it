// «توأم» hashtag pages (src/lib/tag-twins.ts): tags whose page says the same words are one family,
// with one main page — the same one every time. Run: npx tsx --test tests/tag-twins.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { mainOf, twinFamilies, twinKey } from "../src/lib/tag-twins";

test("the same words, or the same word spelled two ways, are one family", () => {
  assert.equal(twinKey("قهوة"), twinKey("صور_قهوة_حقيقية"));
  assert.equal(twinKey("قهوة"), twinKey("صور_قهوة"));
  assert.equal(twinKey("خيرات_الارض"), twinKey("خيرات_الأرض"));
  assert.equal(twinKey("شوكولاتة"), twinKey("شوكولاته"));
  assert.notEqual(twinKey("قهوة"), twinKey("قهوة_الصباح"), "a narrower topic is a page of its own");
  assert.notEqual(twinKey("حلويات"), twinKey("حلويات_منزلية"));
});

test("the main page: the address that says the searched words (from 3 moments), else the most moments", () => {
  const f = twinFamilies([
    { tag: "قهوة_الصباح", count: 19 },
    { tag: "صور_قهوة_الصباح_حقيقية", count: 3 },
    { tag: "صور_قهوة_الصباح", count: 3 },
    { tag: "شوكولاتة", count: 6 },
    { tag: "صور_شوكولاته_حقيقيه", count: 1 },
    { tag: "روقان", count: 34 },
    { tag: "صور_روقان", count: 10 },
    { tag: "بحر", count: 2 },
  ]);
  assert.equal(f.get("قهوة_الصباح")!.main, "صور_قهوة_الصباح_حقيقية");
  assert.deepEqual(f.get("صور_قهوة_الصباح")!.members.slice(0, 1), ["صور_قهوة_الصباح_حقيقية"]);
  assert.equal(f.get("قهوة_الصباح")!.count, 25);
  assert.equal(f.get("صور_شوكولاته_حقيقيه")!.main, "شوكولاتة", "one moment isn't a page yet");
  assert.equal(f.get("صور_روقان")!.main, "روقان");
  assert.deepEqual(f.get("بحر"), { main: "بحر", members: ["بحر"], count: 2 });
});

test("a tie gives the same answer whatever the order", () => {
  const a = { tag: "أزهار", count: 4 };
  const b = { tag: "ازهار", count: 4 };
  assert.equal(mainOf([a, b]).tag, mainOf([b, a]).tag);
});
