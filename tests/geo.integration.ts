// Integration test for keeping a member's rough country, and the per-country numbers.
// Run: npx tsx tests/geo.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { countryStats, recordActivity } from "../src/server/stats";

const TAG = "[geotest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [old, placed] = await Promise.all([
    db.user.create({ data: { displayName: `${TAG} old` } }),
    db.user.create({ data: { displayName: `${TAG} placed`, country: "SA", city: "Riyadh" } }),
  ]);
  const ids = [old.id, placed.id];
  try {
    await check("someone without a country gets it from their next visit, once", async () => {
      await recordActivity(old, new Date(), { country: "KW", city: "Kuwait City" });
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: old.id }, select: { country: true, city: true } }), { country: "KW", city: "Kuwait City" });
      const fresh = await db.user.findUniqueOrThrow({ where: { id: old.id } });
      await recordActivity(fresh, new Date(), { country: "AE", city: "Dubai" });
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: old.id } })).country, "KW", "kept the first one");
    });

    await check("a known country is never replaced by a visit from elsewhere", async () => {
      await recordActivity(placed, new Date(), { country: "PS", city: "Nablus" });
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: placed.id } })).country, "SA");
    });

    await check("per-country numbers count members and newcomers", async () => {
      const rows = await countryStats(since);
      const sa = rows.find((r) => r.country === "SA")!;
      const kw = rows.find((r) => r.country === "KW")!;
      assert.ok(sa.members >= 1 && sa.joined >= 1);
      assert.ok(kw.members >= 1 && kw.joined >= 1);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = await db.user.count({ where: { displayName: { startsWith: TAG } } });
    out.push(left === 0 ? "CLEANUP ok" : `CLEANUP left ${left} test users`);
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
