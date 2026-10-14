// Integration test for Google searches kept from Search Console (src/server/search-console.ts):
// Gemini hears the most shown and most clicked first, never the site's own name; the report
// sets each search beside last week's. Run: npx tsx tests/search-terms.integration.ts — every row
// it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { searchesForGemini, searchReport } from "../src/server/search-console";

const DAYS = ["2099-01-05", "2099-01-12"];
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  try {
    await db.searchTerm.createMany({
      data: [
        { day: DAYS[0], type: "image", query: "صور قهوة حقيقية", clicks: 0, impressions: 40, position: 38 },
        { day: DAYS[1], type: "image", query: "صور قهوة حقيقية", clicks: 0, impressions: 73, position: 30 },
        { day: DAYS[1], type: "web", query: "صور طماطم", clicks: 3, impressions: 8, position: 8 },
        { day: DAYS[1], type: "web", query: "زاومو", clicks: 9, impressions: 50, position: 1 },
        { day: DAYS[1], type: "image", query: "صور روقان", clicks: 0, impressions: 17, position: 22 },
      ],
    });
    await check("Gemini hears the strongest searches first, never the site's own name", async () => {
      assert.deepEqual(await searchesForGemini(), ["صور قهوة حقيقية", "صور طماطم", "صور روقان"]);
    });
    await check("the report sets each search beside last week's", async () => {
      const r = await searchReport();
      assert.equal(r.day, DAYS[1]);
      const coffee = r.rows.find((x) => x.query === "صور قهوة حقيقية")!;
      assert.deepEqual(coffee.before, { clicks: 0, impressions: 40, position: 38 });
      assert.equal(r.rows.find((x) => x.query === "صور طماطم")!.before, null);
    });
  } finally {
    await db.searchTerm.deleteMany({ where: { day: { in: DAYS } } });
    out.push((await db.searchTerm.count({ where: { day: { in: DAYS } } })) === 0 ? "CLEANUP ok" : "CLEANUP left rows");
    await db.$disconnect();
  }
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
