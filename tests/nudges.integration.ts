// Integration test for the reasons to come back: the «لحظة اليوم» reminder goes once a day, only
// to members with notifications who haven't added a shot; the weekly summary only to those
// with something to tell. (Sending itself is off in tests: no push keys.)
// Run: npx tsx tests/nudges.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { today } from "../src/server/daily";
import { remindDaily, weeklySummary } from "../src/server/nudges";

const TAG = "[nudgetest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = async (n: string, push: boolean) => {
    const u = await db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
    if (push) await db.pushDevice.create({ data: { userId: u.id, endpoint: `https://push.test/${u.id}`, p256dh: "x", auth: "y" } });
    return u;
  };
  const [waiting, joined, silent] = [await mk("waiting", true), await mk("joined", true), await mk("silent", false)];
  const ids = [waiting.id, joined.id, silent.id];
  let mine: string | null = null;
  try {
    await check("the daily reminder: members with notifications who haven't added theirs — once", async () => {
      const { day, moment } = await today();
      await db.angle.create({ data: { momentId: moment.id, contributorId: joined.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `nudgetest/${Math.random()}.jpg` } });
      await remindDaily();
      const after = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, nudgedDay: true } });
      const dayOf = (id: string) => after.find((u) => u.id === id)?.nudgedDay ?? null;
      assert.equal(dayOf(waiting.id), day, "reminded");
      assert.equal(dayOf(joined.id), null, "already added a shot");
      assert.equal(dayOf(silent.id), null, "no notifications");
      await remindDaily();
      assert.equal((await db.user.findUnique({ where: { id: waiting.id } }))!.nudgedDay, day, "still once");
    });

    await check("the weekly summary: only to those with something to tell", async () => {
      const m = await db.moment.create({ data: { code: `NG${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: waiting.id } });
      mine = m.id;
      const shot = await db.angle.create({ data: { momentId: m.id, contributorId: waiting.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `nudgetest/${Math.random()}.jpg` } });
      await db.reaction.create({ data: { angleId: shot.id, userId: joined.id, kind: "HEART" } });
      await weeklySummary();
      const [w, j] = await Promise.all([db.user.findUnique({ where: { id: waiting.id } }), db.user.findUnique({ where: { id: joined.id } })]);
      assert.ok(w!.summaryDay, "a heart this week: summary sent");
      assert.equal(j!.summaryDay, null, "nothing happened: no summary");
    });
  } finally {
    await db.reaction.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    if (mine) await db.moment.deleteMany({ where: { id: mine } });
    await db.pushDevice.deleteMany({ where: { userId: { in: ids } } });
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
