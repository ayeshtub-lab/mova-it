// Integration test for the admin dashboard (src/server/stats.ts). Uses days in 2099 so
// real activity never mixes in. Run: npx tsx tests/stats.integration.ts
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { activityDay, getStats, recordActivity } from "../src/server/stats";

const TAG = "[stattest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
// Noon in Mecca on a given day.
const noon = (day: string) => new Date(`${day}T09:00:00Z`);

async function main() {
  const mk = (n: string, day: string, isAdmin = false) =>
    db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, isAdmin, createdAt: noon(day) } });
  const admin = await mk("admin", "2099-01-01", true);
  // Four newcomers on the 10th; two come back on the 11th; one is still around on the 17th.
  const a = await mk("a", "2099-01-10");
  const b = await mk("b", "2099-01-10");
  const c = await mk("c", "2099-01-10");
  const d = await mk("d", "2099-01-10");
  const late = await mk("late", "2099-01-17");
  const ids = [admin.id, a.id, b.id, c.id, d.id, late.id];
  try {
    await check("a day is the Mecca calendar day; one row per person per day", async () => {
      assert.equal(activityDay(new Date("2099-01-10T20:59:00Z")), "2099-01-10"); // 23:59 Mecca
      assert.equal(activityDay(new Date("2099-01-10T21:00:00Z")), "2099-01-11"); // midnight Mecca
      for (const u of [a, b, c, d]) await recordActivity(u, noon("2099-01-10"));
      await recordActivity(a, noon("2099-01-10")); // again the same day: still one row
      assert.equal(await db.activeDay.count({ where: { userId: a.id } }), 1);
    });

    await recordActivity(a, noon("2099-01-11"));
    await recordActivity(b, noon("2099-01-11"));
    await recordActivity(a, noon("2099-01-17"));
    await recordActivity(late, noon("2099-01-17"));

    await check("next-day return: 2 of the 4 newcomers came back", async () => {
      const s = await getStats(admin, noon("2099-01-11"));
      assert.deepEqual(s.returns.yesterday, { joined: 4, returned: 2, rate: 0.5 });
      assert.equal(s.totals.active, 2);
    });

    await check("the 7-day average counts finished days only; week return", async () => {
      const s = await getStats(admin, noon("2099-01-17"));
      assert.deepEqual(s.returns.average, { joined: 4, returned: 2, rate: 0.5 }); // the 10th's cohort
      assert.deepEqual(s.returns.week, { joined: 4, returned: 1, rate: 0.25 }); // a, 7 days later
      assert.equal(s.returns.yesterday.rate, null); // nobody joined on the 16th
      assert.equal(s.totals.joined, 1);
      const day17 = s.series.find((x) => x.day === "2099-01-17");
      assert.deepEqual(day17, { day: "2099-01-17", active: 2, joined: 1, shots: 0 });
      assert.equal(s.series.length, 14);
    });

    await check("admins only", async () => {
      await assert.rejects(getStats(a));
      await assert.rejects(getStats(null));
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
