// Integration test for finding and taking the place out of a title (src/server/retitle.ts) — a name
// counts only where it stands as a place: «صور الخضر» is vegetables, not the town.
// Run: npx tsx tests/retitle.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { named, placePatterns, withoutPlace } from "../src/server/retitle";

async function main() {
  const suffix = Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, "س");
  const village = `الخضر${suffix}`;
  const gov = `بيت لحم${suffix}`;
  const ids = [`rt-v-${suffix}`, `rt-g-${suffix}`];
  await db.place.create({ data: { id: ids[1], kind: "GOVERNORATE", countryCode: "PS", nameAr: gov, slug: ids[1], search: gov, lat: 31.7, lng: 35.2 } });
  await db.place.create({ data: { id: ids[0], kind: "VILLAGE", countryCode: "PS", nameAr: village, parentId: ids[1], slug: ids[0], search: village, lat: 31.7, lng: 35.2 } });
  try {
    const p = await placePatterns();
    const cases: [string, string][] = [
      [`صور خضار طازجة في ${village}`, "صور خضار طازجة"],
      [`زهرة زنبق حمراء في أصيص ب${village}`, "زهرة زنبق حمراء في أصيص"],
      [`خيار أخضر طازج في دلو ببلدة ${village}`, "خيار أخضر طازج في دلو"],
      [`أوراق شجر جافة في طبيعة محافظة ${gov}`, "أوراق شجر جافة في طبيعة"],
    ];
    for (const [title, cut] of cases) {
      assert.ok(named(title, p), `not found: ${title}`);
      assert.equal(withoutPlace(title, p), cut);
      assert.ok(!named(withoutPlace(title, p), p), "never picked again");
    }
    // The name on its own — the word, not the place — is left alone.
    assert.ok(!named(`صور ${village} الطازجة`, p), "the word alone is not a place");
    assert.ok(!named("عرس فلسطيني بالدبكة", p));
    console.log("PASS a place is found and cut only where it stands as a place (6 checks)");
  } finally {
    await db.place.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.log("FAIL", error);
  process.exit(1);
});
