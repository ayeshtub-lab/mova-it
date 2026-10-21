// The English swap of card lists (src/server/localize.ts inEnglish). Run: npx tsx tests/localize.test.ts
import assert from "node:assert/strict";
import { inEnglish } from "../src/server/localize";

const when = new Date("2026-10-21T10:00:00Z");
const list = [
  { code: "K7M2Q4", title: "قهوة الصباح", titleEn: "Morning coffee in Bethlehem", placeName: "أرطاس", placeNameEn: "Bethlehem", lastActivityAt: when, angles: [{ shotTitle: "فنجان", shotTitleEn: "A cup of coffee", isOpen: true }] },
  { code: "X3HTPQ", title: "زيتون", titleEn: null, placeName: null, placeNameEn: null, lastActivityAt: when, angles: [{ shotTitle: "شجرة", shotTitleEn: "" }] },
];

const ar = inEnglish(list, "ar");
assert.equal(ar, list, "Arabic: the very same list");
const en = inEnglish(list, "en");
assert.equal(en[0].title, "Morning coffee in Bethlehem");
assert.equal(en[0].placeName, "Bethlehem");
assert.equal(en[0].angles[0].shotTitle, "A cup of coffee");
assert.equal(en[0].angles[0].isOpen, true);
assert.equal(en[0].lastActivityAt, when, "dates stay dates");
assert.equal(en[1].title, "زيتون", "no English yet: the Arabic");
assert.equal(en[1].angles[0].shotTitle, "شجرة", "an empty English: the Arabic");
assert.equal(list[0].title, "قهوة الصباح", "the cached original untouched");
console.log("PASS inEnglish (7 checks)");
