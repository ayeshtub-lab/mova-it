// Integration test for grouped notices: hearts on several shots of one moment are one notice
// that counts them (one push), a read notice starts a new one, and new angles by the same
// person add up the same way.
// Run: npx tsx tests/notify-group.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createMoment } from "../src/server/moments";
import { listNotifications, markNotificationsRead, notifyNewAngle } from "../src/server/notifications";
import { setReaction } from "../src/server/reactions";

const TAG = "[groupetest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, fan] = [await mk("owner"), await mk("fan")];
  const ids = [owner.id, fan.id];
  const shot = (momentId: string, contributorId: string) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `grouptest/${Math.random()}.jpg` } });
  try {
    const moment = await createMoment(owner, { title: `${TAG} m`, kind: "EVERYDAY", visibility: "PUBLIC" });
    const shots = [await shot(moment.id, owner.id), await shot(moment.id, owner.id), await shot(moment.id, owner.id), await shot(moment.id, owner.id)];
    const likes = () => db.notification.findMany({ where: { userId: owner.id, kind: "LIKE" }, orderBy: { createdAt: "asc" } });

    await check("hearts on three shots of one moment are one notice that counts them", async () => {
      for (const s of shots.slice(0, 3)) await setReaction(fan, s.id, true);
      const rows = await likes();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].count, 3);
      const seen = (await listNotifications(owner)).find((n) => n.kind === "LIKE");
      assert.equal(seen?.count, 3);
    });

    await check("taking a heart back and giving it again doesn't count twice", async () => {
      await setReaction(fan, shots[0].id, false);
      await setReaction(fan, shots[0].id, true);
      assert.equal((await likes())[0].count, 3);
    });

    await check("once read, the next heart is a new notice", async () => {
      await markNotificationsRead(owner, (await likes()).map((n) => n.id));
      await setReaction(fan, shots[3].id, true);
      const rows = await likes();
      assert.equal(rows.length, 2);
      assert.equal(rows[1].count, 1);
    });

    await check("new angles by the same person add up while unread", async () => {
      const a = await shot(moment.id, fan.id);
      await notifyNewAngle(a.id);
      const b = await shot(moment.id, fan.id);
      await notifyNewAngle(b.id);
      const rows = await db.notification.findMany({ where: { userId: owner.id, kind: "NEW_ANGLE" } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].count, 2);
    });
  } finally {
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
    await db.reaction.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
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
