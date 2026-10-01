// Integration test for one-button deletion and the inbox: the creator deletes a whole moment
// (everyone's shots); someone else only all of their own shots; «لحظة اليوم» can't be deleted.
// In the inbox, an open thread receives the other side's replies, and looking at the list
// clears the badge.
// Run: npx tsx tests/delete-inbox.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { AngleError, deleteMoment, deleteMyShots } from "../src/server/angles";
import { markThreadsSeen, messagesSince, sendMessage, unreadCount } from "../src/server/inbox";

const TAG = "[deltest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, friend] = [await mk("owner"), await mk("friend")];
  const ids = [owner.id, friend.id];
  let n = 0;
  const moment = (data: Record<string, unknown> = {}) =>
    db.moment.create({ data: { code: `DL${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: `${TAG} m`, creatorId: owner.id, ...data } as never });
  const shot = (momentId: string, contributorId: string) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `deltest/${Math.random()}.jpg` } });
  try {
    await check("someone else deletes all of their own shots at once — nobody else's", async () => {
      const m = await moment();
      await shot(m.id, owner.id);
      await shot(m.id, friend.id);
      await shot(m.id, friend.id);
      assert.equal((await deleteMyShots(friend, m.code)).deleted, 2);
      assert.equal(await db.angle.count({ where: { momentId: m.id } }), 1, "the owner's shot stays");
      await assert.rejects(deleteMoment(friend, m.code), (e) => e instanceof AngleError && e.code === "not_found");
    });

    await check("the creator deletes the whole moment with everyone's shots", async () => {
      const m = await moment();
      await shot(m.id, owner.id);
      await shot(m.id, friend.id);
      assert.equal((await deleteMoment(owner, m.code)).deleted, 2);
      assert.equal(await db.moment.findUnique({ where: { id: m.id } }), null);
      assert.equal(await db.angle.count({ where: { momentId: m.id } }), 0);
    });

    await check("«لحظة اليوم» can't be deleted, even by its creator", async () => {
      const m = await moment({ kind: "DAILY" });
      await assert.rejects(deleteMoment(owner, m.code), (e) => e instanceof AngleError && e.code === "not_found");
    });

    await check("an open thread receives replies; looking at the list clears the badge", async () => {
      const m = await moment();
      const t = await db.momentInvite.create({ data: { momentId: m.id, fromUserId: owner.id, toUserId: friend.id } });
      const before = new Date();
      await sendMessage(friend, t.id, "وصلت؟");
      const fresh = await messagesSince(owner, t.id, new Date(before.getTime() - 1000));
      assert.deepEqual(fresh?.map((x) => [x.body, x.mine]), [["وصلت؟", false]]);
      assert.equal(await messagesSince(await mk("stranger"), t.id, before), null, "not someone else's thread");
      await sendMessage(friend, t.id, "؟؟");
      assert.equal(await unreadCount(owner), 1);
      await markThreadsSeen(owner, [t.id]);
      assert.equal(await unreadCount(owner), 0, "the badge clears");
    });
  } finally {
    const all = await db.user.findMany({ where: { displayName: { startsWith: TAG } }, select: { id: true } });
    const every = all.map((u) => u.id);
    await db.directMessage.deleteMany({ where: { senderId: { in: every } } });
    await db.momentInvite.deleteMany({ where: { OR: [{ fromUserId: { in: every } }, { toUserId: { in: every } }] } });
    await db.angle.deleteMany({ where: { contributorId: { in: every } } });
    await db.moment.deleteMany({ where: { creatorId: { in: every } } });
    await db.user.deleteMany({ where: { id: { in: every } } });
    void ids;
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
