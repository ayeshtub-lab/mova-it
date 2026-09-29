// Integration test for the per-campaign numbers (src/server/stats.ts sourceStats): who
// joined from where, who published a shot, who came back on a later day.
// Run: npx tsx tests/source.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { activityDay, sourceStats } from "../src/server/stats";

const TAG = "[srctest]";
async function main() {
  const since = new Date(Date.now() - 60_000);
  const mk = (n: string, source: string | null) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: true, source } });
  const [a, b, c] = [await mk("a", "srctest-house"), await mk("b", "srctest-house"), await mk("c", "srctest-plant")];
  const ids = [a.id, b.id, c.id];
  try {
    const m = await db.moment.create({ data: { code: `SRC${Date.now().toString(36).slice(-3).toUpperCase()}`, title: TAG, creatorId: a.id } });
    await db.angle.create({ data: { momentId: m.id, contributorId: a.id, mediaType: "PHOTO", status: "READY" } });
    const tomorrow = activityDay(new Date(Date.now() + 24 * 3600 * 1000));
    await db.activeDay.create({ data: { userId: b.id, day: tomorrow } });
    await db.activeDay.create({ data: { userId: c.id, day: activityDay() } }); // same day: not a return
    const rows = await sourceStats(since);
    const house = rows.find((r) => r.source === "srctest-house")!;
    const plant = rows.find((r) => r.source === "srctest-plant")!;
    assert.deepEqual([house.joined, house.shot, house.returned], [2, 1, 1]);
    assert.deepEqual([plant.joined, plant.shot, plant.returned], [1, 0, 0]);
    console.log("PASS per-source joined / shot / came back");
  } finally {
    await db.activeDay.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    console.log((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left rows");
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.log("FAIL", e);
  process.exit(1);
});
