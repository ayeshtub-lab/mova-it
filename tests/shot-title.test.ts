// A shot page's title and heading never carry a place (his call, 2026-10-21; the page still added
// «— الخضر» until 2026-10-22). Run: npx tsx tests/shot-title.test.ts
import assert from "node:assert/strict";
import { shotLabel, shotTitle, type PublicShot } from "../src/server/seo";

const shot = (over: Partial<PublicShot>) =>
  ({
    id: "cmva0gd6j000006jy63vbhpv8",
    aiTitle: null,
    aiTitleEn: null,
    caption: null,
    scene: "nature",
    moment: { id: "m1", code: "B66N9A", title: "خيرات المزرعة", titleEn: null },
    contributor: { displayName: "عبد الله", isGuest: false },
    place: { slug: "الخضر", nameAr: "الخضر", nameEn: "Al-Khader", kind: "TOWN" },
    ...over,
  }) as unknown as PublicShot;

assert.equal(shotTitle(shot({ aiTitle: "ثمرة يقطين أخضر ضخمة" }), "ar"), "ثمرة يقطين أخضر ضخمة", "its own title, no «— الخضر»");
assert.equal(shotTitle(shot({ aiTitle: "قهوة الصباح", place: { slug: "بيت-لحم", nameAr: "بيت لحم", nameEn: "Bethlehem", kind: "GOVERNORATE" } } as Partial<PublicShot>), "ar"), "قهوة الصباح", "no «— محافظة بيت لحم»");
assert.equal(shotTitle(shot({ aiTitle: "ثمرة يقطين", aiTitleEn: "A giant green pumpkin" }), "en"), "A giant green pumpkin");

const label = shotLabel(shot({}), "ar");
assert.ok(!label.includes("الخضر"), `no place in the label: ${label}`);
assert.ok(label.startsWith("خيرات المزرعة"), label);
assert.ok(!shotTitle(shot({}), "ar").includes("الخضر"), "no place without an SEO title either");
assert.ok(!shotLabel(shot({}), "en").includes("Al-Khader"));

console.log("shot titles without a place ✓");
