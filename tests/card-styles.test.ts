// A card's look and kinds (src/lib/card-styles.ts, 2026-10-24): the look key with its place, size and
// tilt; older cards' three-part key still read and accepted; the occasions first in their days.
// Run: npx tsx tests/card-styles.test.ts
import assert from "node:assert/strict";
import { DEFAULT_CARD_STYLE, cardImage, cardKindsNow, cardStyle, isCardStyle, occasionsNow, styleKey } from "../src/lib/card-styles";

let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("PASS " + name);
};

check("the look key both ways, kept in range", () => {
  const key = "ruqaa.gold.outline.navy.30.22.140.-15";
  const look = cardStyle(key);
  assert.deepEqual([look.font, look.color, look.frame, look.frameColor, look.x, look.y, look.size, look.tilt], ["ruqaa", "gold", "outline", "navy", 30, 22, 140, -15]);
  assert.equal(styleKey(look), key);
  assert.ok(isCardStyle(key) && isCardStyle(DEFAULT_CARD_STYLE));
  assert.ok(!isCardStyle("ruqaa.gold.outline.navy.30.22.900.0"), "a size out of range is not a key");
  assert.ok(!isCardStyle("nope") && !isCardStyle("cairo.pink.none.black.50.50.100.0"));
});

check("older cards' «font.place.colour» read, and still accepted from an editor left open", () => {
  const look = cardStyle("amiri.top.rose");
  assert.deepEqual([look.font, look.color, look.y, look.x, look.size, look.tilt, look.frame], ["amiri", "rose", 18, 50, 100, 0, "none"]);
  assert.ok(isCardStyle("cairo.bottom.white"));
  assert.ok(!isCardStyle("cairo.middle.white"));
});

check("the occasions in their days (Hijri), first among the tabs", () => {
  assert.deepEqual(occasionsNow(new Date("2026-10-24T12:00:00Z")), [], "Jumada al-Ula: none");
  assert.deepEqual(occasionsNow(new Date("2027-02-27T12:00:00Z")), ["ramadan", "fitr"], "late Ramadan: Ramadan, and Eid al-Fitr coming");
  assert.deepEqual(occasionsNow(new Date("2027-03-12T12:00:00Z")), ["fitr"], "Eid al-Fitr");
  assert.equal(cardKindsNow(new Date("2027-03-12T12:00:00Z"))[0], "fitr");
  assert.equal(cardKindsNow(new Date("2026-10-24T12:00:00Z"))[0], "morning");
  assert.ok(!cardKindsNow().includes("other" as never));
});

check("an edited card's picture gets a new address (2026-10-26: phones kept the old one)", () => {
  assert.equal(cardImage({ id: "cabc123", imagePath: "cards/cabc123.jpg" }), "/i/card-cabc123.jpg");
  assert.equal(cardImage({ id: "cabc123", imagePath: "cards/cabc123-mh2x9k.jpg" }), "/i/card-cabc123.jpg?v=mh2x9k");
  assert.equal(cardImage({ id: "cabc123" }), "/i/card-cabc123.jpg");
});

console.log(`${n} checks`);
