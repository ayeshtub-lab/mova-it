// Integration test for «لحظة اليوم» (src/server/daily.ts). Uses days in 2099 so it
// never touches the real daily moment. Run: npx tsx tests/daily.integration.ts
import "./env"; // DATABASE_URL + Blob token (Discover may include real public moments)
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { visibleAngle } from "../src/server/access";
import { addDays, dayEnd, dayKey, DailyError, optionsFor, setTheme, today, tomorrowVote, vote } from "../src/server/daily";
import { listDiscover } from "../src/server/discover";
import { getMomentView } from "../src/server/moments";

const TAG = "[dailytest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const at = (iso: string) => new Date(iso);
const NOON = (day: string) => at(`${day}T09:00:00Z`); // 12:00 Mecca

async function main() {
  const mk = (n: string, isAdmin = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, isAdmin } });
  const [ali, sara, admin] = await Promise.all([mk("ali"), mk("sara"), mk("admin", true)]);
  const ids = [ali.id, sara.id, admin.id];
  const D1 = "2099-01-10";
  try {
    await check("a day runs 06:00 → 06:00 Mecca time (03:00 UTC)", async () => {
      assert.equal(dayKey(at("2099-01-10T02:59:00Z")), "2099-01-09"); // 05:59 Mecca: still yesterday (dawn prayer)
      assert.equal(dayKey(at("2099-01-10T03:00:00Z")), "2099-01-10");
      assert.equal(addDays("2099-01-31", 1), "2099-02-01");
      assert.equal(dayEnd("2099-01-10").toISOString(), "2099-01-11T03:00:00.000Z");
    });

    await check("three options per day: stable, distinct", async () => {
      const a = await optionsFor(D1);
      const b = await optionsFor(D1);
      assert.equal(a.length, 3);
      assert.equal(new Set(a.map((t) => t.key)).size, 3);
      assert.deepEqual(a.map((t) => t.key), b.map((t) => t.key));
    });

    let dailyCode = "";
    await check("today() creates one public DAILY moment, even with concurrent first visits", async () => {
      const results = await Promise.all([today(NOON(D1)), today(NOON(D1)), today(NOON(D1))]);
      assert.equal(new Set(results.map((r) => r.moment.id)).size, 1);
      const r = results[0];
      assert.equal(r.moment.kind, "DAILY");
      assert.equal(r.moment.visibility, "PUBLIC");
      assert.equal(await db.moment.count({ where: { daily: { day: D1 } } }), 1);
      dailyCode = r.moment.code;
    });

    await check("give-to-get: you see the others' angles only after adding yours", async () => {
      const m = await db.moment.findUniqueOrThrow({ where: { code: dailyCode } });
      const angle = (userId: string, minute: number) =>
        db.angle.create({ data: { momentId: m.id, contributorId: userId, mediaType: "PHOTO", status: "READY", screening: "allowed", capturedAt: new Date(Date.UTC(2099, 0, 10, 9, minute)), expiresAt: at("2100-01-01T00:00:00Z") } });
      const a1 = await angle(sara.id, 1);
      const a2 = await angle(sara.id, 2);
      let view = await getMomentView(dailyCode, ali);
      assert.equal(view?.angles.length, 1);
      assert.equal(view?.lockedCount, 1);
      assert.equal(await visibleAngle(ali, a2.id), null);
      const d = (await listDiscover(ali)).find((x) => x.code === dailyCode);
      assert.equal(d?.daily, true);
      assert.equal(d?.lockedCount, 1);
      await angle(ali.id, 3);
      view = await getMomentView(dailyCode, ali);
      assert.equal(view?.lockedCount, 0);
      assert.ok(await visibleAngle(ali, a2.id));
      assert.ok(a1);
    });

    await check("vote for tomorrow: only the offered themes, one vote each, may change", async () => {
      const t = await tomorrowVote(ali, NOON(D1));
      assert.equal(t.day, addDays(D1, 1));
      const [first, second] = t.options;
      await assert.rejects(vote(ali, "not-a-theme", NOON(D1)), DailyError);
      await vote(ali, first.key, NOON(D1));
      await vote(ali, second.key, NOON(D1)); // changed their mind
      await vote(sara, second.key, NOON(D1));
      const after = await tomorrowVote(ali, NOON(D1));
      assert.equal(after.mine, second.key);
      assert.equal(after.options.find((o) => o.key === second.key)?.votes, 2);
      assert.equal(after.options.find((o) => o.key === first.key)?.votes, 0);
    });

    await check("the next day opens with the winning theme", async () => {
      const winnerKey = (await tomorrowVote(ali, NOON(D1))).options.reduce((a, b) => (b.votes > a.votes ? b : a)).key;
      const next = await today(NOON(addDays(D1, 1)));
      assert.equal(next.plan.themeKey, winnerKey);
      assert.equal(next.plan.source, "vote");
    });

    await check("any theme from the list can be voted for — and win — not only the featured three", async () => {
      const D2 = addDays(D1, 2);
      const t = await tomorrowVote(ali, NOON(addDays(D1, 1)));
      assert.equal(t.day, D2);
      assert.equal(t.options.length, 3);
      assert.ok(t.more.length >= 10, "the rest of the list");
      const pick = t.more[t.more.length - 1];
      await vote(ali, pick.key, NOON(addDays(D1, 1)));
      await vote(sara, pick.key, NOON(addDays(D1, 1)));
      const d2 = await today(NOON(D2));
      assert.equal(d2.plan.themeKey, pick.key);
      // Yesterday's and the day before's themes can't be picked again so soon.
      const t3 = await tomorrowVote(ali, NOON(D2));
      assert.ok(![...t3.options, ...t3.more].some((o) => o.key === pick.key));
      await assert.rejects(vote(ali, pick.key, NOON(D2)), DailyError);
    });

    await check("admin: sets a coming day's theme (no vote then) and can rename today", async () => {
      const D3 = addDays(D1, 4);
      await assert.rejects(setTheme(ali, D3, "fajr"));
      await setTheme(admin, D3, "fajr");
      const v = await tomorrowVote(ali, NOON(addDays(D1, 3)));
      assert.equal(v.decided?.key, "fajr");
      const d3 = await today(NOON(D3));
      assert.equal(d3.plan.themeKey, "fajr");
      assert.equal(d3.plan.source, "admin");
      assert.ok(d3.theme.tip, "mosque themes carry the respect tip");
      await setTheme(admin, D3, "coffee");
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: d3.moment.id } })).title, "☕ قهوتك الصباحية");
    });
  } finally {
    const plans = await db.dailyPlan.findMany({ where: { day: { gte: "2099-01-01" } }, select: { momentId: true } });
    await db.dailyVote.deleteMany({ where: { day: { gte: "2099-01-01" } } });
    await db.dailyPlan.deleteMany({ where: { day: { gte: "2099-01-01" } } });
    await db.moment.deleteMany({ where: { id: { in: plans.map((p) => p.momentId).filter((x): x is string => !!x) } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
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
