// «✍️ احكي عن صورتك»: the owner's words, cleaned (src/lib/shot-note.ts). Run: npx tsx --test tests/shot-note.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTE_MAX, cleanNote } from "../src/lib/shot-note";

test("plain words stay as written, spaces tidied", () => {
  assert.equal(cleanNote("  كروشيه شغل إيدي،\n\nخلّصتها بأسبوع 🧶  "), "كروشيه شغل إيدي، خلّصتها بأسبوع 🧶");
  assert.equal(cleanNote("عرس سنة 2019 بقرية بيتا"), "عرس سنة 2019 بقرية بيتا", "a year is not a phone number");
  assert.equal(cleanNote("السعر 35 شيكل"), "السعر 35 شيكل");
});

test("no phone numbers, links, emails or @handles", () => {
  assert.equal(cleanNote("للطلب 0599-123-456 أهلا"), "للطلب أهلا");
  assert.equal(cleanNote("واتساب +972 59 912 3456"), "واتساب");
  assert.equal(cleanNote("اتصل ٠٥٩٩١٢٣٤٥٦ شكرا"), "اتصل شكرا");
  assert.equal(cleanNote("شوف https://example.com/x و www.shop.ps"), "شوف و");
  assert.equal(cleanNote("صفحتي myshop.com"), "صفحتي");
  assert.equal(cleanNote("راسلني a.b@mail.com"), "راسلني");
  assert.equal(cleanNote("تابعوني @my.shop هناك"), "تابعوني هناك");
});

test("empty or not text → nothing; long → cut at 300 characters", () => {
  assert.equal(cleanNote(""), null);
  assert.equal(cleanNote("   "), null);
  assert.equal(cleanNote("0599123456"), null);
  assert.equal(cleanNote(42), null);
  assert.equal([...cleanNote("أ".repeat(400))!].length, NOTE_MAX);
});
