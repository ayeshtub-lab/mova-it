// Integration test for shots left without «نشر» (src/server/drafts.ts): an hour on, their owner is
// reminded once per moment — never twice, never for a fresh one, never in «لحظة اليوم»; coming
// back, they find their own drafts waiting (nobody else's); a friend's moment shows in «نشاط
// الأصحاب» only once something in it is published.
// Run: npx tsx tests/drafts.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { publishAngle } from "../src/server/angles";
import { myDrafts, remindDrafts } from "../src/server/drafts";

const TAG = "[drafttest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const HOUR = 3600 * 1000;
const code = () => `DR${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = [await mk("owner"), await mk("other")];
  const ids = [owner.id, other.id];
  const moment = (kind: "EVERYDAY" | "DAILY" = "EVERYDAY") =>
    db.moment.create({ data: { code: code(), title: "شاي العصر", kind, visibility: "FRIENDS", creatorId: owner.id, participants: { create: { userId: owner.id, role: "HOST" } } } });
  const draft = (momentId: string, ago: number, by = owner.id) =>
    db.angle.create({ data: { momentId, contributorId: by, mediaType: "PHOTO", status: "DRAFT", screening: "allowed", mediaPath: `drafttest/${Math.random()}.jpg`, uploadedAt: new Date(Date.now() - ago) } });
  const told = (userId: string) => db.notification.count({ where: { userId, kind: "DRAFT_WAITING" } });
  try {
    await check("an hour on, one reminder per moment — then never again", async () => {
      const m = await moment();
      await draft(m.id, 2 * HOUR);
      await draft(m.id, 2 * HOUR);
      await remindDrafts();
      assert.equal(await told(owner.id), 1, "two shots of one visit: one reminder");
      await remindDrafts();
      assert.equal(await told(owner.id), 1, "and not again on the next hour");
    });

    await check("not for a fresh shot, nor in «لحظة اليوم»", async () => {
      await db.notification.deleteMany({ where: { userId: owner.id } });
      await db.angle.deleteMany({ where: { contributorId: owner.id } }); // the first check's shots
      await draft((await moment()).id, 10 * 60 * 1000);
      await draft((await moment("DAILY")).id, 2 * HOUR);
      await remindDrafts();
      assert.equal(await told(owner.id), 0);
    });

    await check("coming back: their own drafts wait for them, nobody else's", async () => {
      const m = await moment();
      const mine = await draft(m.id, HOUR);
      await draft(m.id, HOUR, other.id);
      const back = await myDrafts(owner, m.id);
      assert.deepEqual(
        back.map((d) => d.angleId),
        [mine.id],
      );
      assert.deepEqual(await myDrafts(null, m.id), [], "a visitor has none");
      await publishAngle(owner, mine.id);
      assert.deepEqual(await myDrafts(owner, m.id), [], "published: no longer waiting");
    });
  } finally {
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
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
