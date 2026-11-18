// When a new photo's fingerprint makes it a twin of an earlier shot (src/lib/dhash.ts twinVerdict).
// His note 2026-11-18: different moon and sunset photos were refused as «the same photo».
// Run: npx tsx --test tests/dhash.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { hamming, twinVerdict } from "../src/lib/dhash";

test("in the same moment: the same photo, a near one, a new angle", () => {
  assert.equal(twinVerdict(0, true, "food"), "duplicate");
  assert.equal(twinVerdict(6, true, "food"), "duplicate");
  assert.equal(twinVerdict(8, true, null), "too_close");
  assert.equal(twinVerdict(9, true, "food"), null, "9 bits and more: a different photo");
});

test("another moment of one's own: only the very same photo again", () => {
  assert.equal(twinVerdict(0, false, "food"), "duplicate");
  assert.equal(twinVerdict(4, false, "nature"), "duplicate");
  assert.equal(twinVerdict(5, false, "nature"), null);
  assert.equal(twinVerdict(8, false, null), null, "never «too close» across moments");
});

test("plain skies (moon, sunset, sea): only the exact photo twice in one moment", () => {
  // Two real moon photos of one person (2026-10-24 and 2026-11-08): 8 bits apart, refused before as «too close».
  const bits = hamming("3f0f0f0f0f0f0f0f", "0c0f0f0f0f0f3f17");
  assert.equal(bits, 8);
  assert.equal(twinVerdict(bits, false, "sky"), null);
  assert.equal(twinVerdict(bits, true, "sky"), null);
  assert.equal(twinVerdict(3, true, "sunset"), null);
  assert.equal(twinVerdict(0, true, "sea"), "duplicate");
  assert.equal(twinVerdict(0, false, "sunset"), null);
});
