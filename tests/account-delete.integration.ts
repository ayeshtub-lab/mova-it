// Integration test for deleting an account (src/server/account.ts).
// Run: npx tsx tests/account-delete.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { deleteAccount } from "../src/server/account";

const TAG = "[deltest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [leaving, friend] = await Promise.all([mk("leaving"), mk("friend")]);
  const moment = (creatorId: string, title: string) => db.moment.create({ data: { code: `DT${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} ${title}`, creatorId } });
  const angle = (momentId: string, contributorId: string) => db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY" } });
  try {
    const onlyMine = await moment(leaving.id, "only mine");
    await angle(onlyMine.id, leaving.id);
    const shared = await moment(leaving.id, "shared");
    const myShot = await angle(shared.id, leaving.id);
    const friendsShot = await angle(shared.id, friend.id);
    const friendsMoment = await moment(friend.id, "friend's");
    const myShotThere = await angle(friendsMoment.id, leaving.id);
    const friendsOwn = await angle(friendsMoment.id, friend.id);
    await db.reaction.create({ data: { angleId: friendsOwn.id, userId: leaving.id, kind: "HEART" } });
    await db.comment.create({ data: { angleId: friendsOwn.id, userId: leaving.id, body: "hi" } });
    await db.follow.create({ data: { followerId: leaving.id, followingId: friend.id } });
    const withMe = await db.montage.create({ data: { momentId: friendsMoment.id, angleIds: [friendsOwn.id, myShotThere.id] } });
    const withoutMe = await db.montage.create({ data: { momentId: shared.id, angleIds: [friendsShot.id] } });

    const result = await deleteAccount(leaving);

    await check("the account and everything it made is gone", async () => {
      assert.deepEqual(result, { shots: 3, moments: 1, handedOver: 1 });
      assert.equal(await db.user.count({ where: { id: leaving.id } }), 0);
      assert.equal(await db.angle.count({ where: { contributorId: leaving.id } }), 0);
      assert.equal(await db.reaction.count({ where: { userId: leaving.id } }), 0);
      assert.equal(await db.comment.count({ where: { userId: leaving.id } }), 0);
      assert.equal(await db.follow.count({ where: { followerId: leaving.id } }), 0);
      assert.equal(await db.moment.count({ where: { id: onlyMine.id } }), 0, "a moment with only their shots is deleted");
    });

    await check("others keep their memories: shared moment handed to Zawmo, their shots stay", async () => {
      const kept = await db.moment.findUniqueOrThrow({ where: { id: shared.id }, include: { creator: true, angles: true } });
      assert.equal(kept.creator.isSystem, true);
      assert.deepEqual(kept.angles.map((a) => a.id), [friendsShot.id]);
      assert.equal(await db.angle.count({ where: { id: myShot.id } }), 0);
      assert.equal(await db.angle.count({ where: { momentId: friendsMoment.id } }), 1, "the friend's own shot stays in their moment");
    });

    await check("montages showing their shots are deleted; others stay", async () => {
      assert.equal(await db.montage.count({ where: { id: withMe.id } }), 0);
      assert.equal(await db.montage.count({ where: { id: withoutMe.id } }), 1);
    });

    await check("the Zawmo account itself can't be deleted", async () => {
      const system = await db.user.findFirstOrThrow({ where: { isSystem: true } });
      await assert.rejects(deleteAccount(system));
    });
  } finally {
    const ids = [leaving.id, friend.id];
    await db.moment.deleteMany({ where: { title: { startsWith: TAG } } });
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
