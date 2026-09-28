// Links moments created before places existed: a typed place («ارطاس», «بيت لحم - المدبسة»)
// becomes the standard place when the name matches one exactly; the text stays when it says
// more (a spot like «برك سليمان»). Their shots without a place take the moment's.
// Safe to re-run. Prints what it would do with --dry.
//   npx tsx tools/places/backfill.ts --db=test|real [--dry]
import { config } from "dotenv";

const target = process.argv.find((a) => a.startsWith("--db="))?.slice(5);
if (target !== "test" && target !== "real") throw new Error("say which database: --db=test or --db=real");
const dry = process.argv.includes("--dry");
config({ path: target === "test" ? ".env.local" : ".env", quiet: true, override: true });

async function main() {
  const { db } = await import("../../src/lib/db");
  const { normalize } = await import("../../src/lib/arabic");
  const { resolvePlaceText } = await import("../../src/server/places");

  const moments = await db.moment.findMany({ where: { placeId: null, placeName: { not: null } }, select: { id: true, code: true, placeName: true } });
  let linked = 0;
  for (const m of moments) {
    const placeId = await resolvePlaceText(m.placeName);
    if (!placeId) {
      console.log(`  ${m.code}: «${m.placeName}» — no standard place, kept as a spot`);
      continue;
    }
    const place = (await db.place.findUnique({ where: { id: placeId }, select: { nameAr: true } }))!;
    const keepText = normalize(m.placeName!) !== normalize(place.nameAr);
    console.log(`  ${m.code}: «${m.placeName}» → ${place.nameAr}${keepText ? ` (spot «${m.placeName}» kept)` : ""}`);
    if (!dry) await db.moment.update({ where: { id: m.id }, data: { placeId, placeName: keepText ? m.placeName : null } });
    linked++;
  }

  // Shots with no place of their own take their moment's.
  const shots = await db.angle.findMany({ where: { placeId: null, moment: { placeId: { not: null } } }, select: { id: true, moment: { select: { placeId: true } } } });
  if (!dry) {
    for (const a of shots) await db.angle.update({ where: { id: a.id }, data: { placeId: a.moment.placeId, placeFrom: "MOMENT" } });
  }
  console.log(`${target}${dry ? " (dry run)" : ""}: ${linked} of ${moments.length} moments linked; ${shots.length} shots took their moment's place`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
