// Integration test for «📍 أرطاس؟» (src/server/place-guess.ts): the place a moment's name says,
// offered for confirming — and nothing for names whose words only look like towns.
// Run: npx tsx tests/place-guess.integration.ts — reads places only.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { guessPlace, placeInText } from "../src/server/place-guess";

const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  if ((await db.place.count()) < 1000) throw new Error("the test database has no places");
  await check("a place in the name is found, a stuck-on letter too", async () => {
    assert.equal((await guessPlace("عرس في أرطاس"))?.name, "أرطاس");
    assert.equal((await guessPlace("قهوة المساء بأرطاس"))?.name, "أرطاس");
    assert.equal((await guessPlace("#حلحول سوق الخضار"))?.name, "حلحول");
  });
  await check("two words before one: «بيت لحم», the city", async () => {
    const g = await guessPlace("رواق في بيت لحم");
    assert.equal(g?.name, "بيت لحم");
    assert.equal(g?.kind, "CITY");
  });
  await check("the same name in two countries: the city first (Aqaba, Jordan)", async () => {
    const g = await guessPlace("غروب العقبة");
    assert.equal(g?.name, "العقبة");
    assert.equal(g?.kind, "CITY");
  });
  await check("everyday words that are also towns say nothing", async () => {
    for (const t of ["زهور بيضاء في الطبيعة", "سماء زرقاء", "لحظة جديدة", "صور العرس", "شقائق النعمان في الربيع", "غروب جميل", "حلويات", "زاوية النباتات المنزلية"]) {
      assert.equal(await placeInText(t), null, t);
    }
  });
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
