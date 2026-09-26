// Integration test for comment replies and likes, the shot's look, shares and trending.
// Run: npx tsx tests/engage.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { addComment, CommentError, deleteComment, listComments, setCommentLike } from "../src/server/comments";
import { trendingVideos } from "../src/server/discover";
import { setAngleLook, SoundError } from "../src/server/sounds";

const TAG = "[engtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, friend, other] = await Promise.all([mk("owner"), mk("friend"), mk("other")]);
  const ids = [owner.id, friend.id, other.id];
  try {
    const m = await db.moment.create({ data: { code: `EG${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} m`, visibility: "PUBLIC", creatorId: owner.id } });
    const angle = await db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "VIDEO", status: "READY", screening: "allowed" } });

    await check("replies sit under their comment; a reply to a reply joins the same thread", async () => {
      const c1 = await addComment(friend, angle.id, "first");
      const c2 = await addComment(other, angle.id, "second");
      const r1 = await addComment(owner, angle.id, "reply to first", c1.id);
      const r2 = await addComment(other, angle.id, "reply to the reply", r1.id);
      assert.equal(r2.parentId, c1.id, "attached to the thread's top comment");
      const list = await listComments(owner, angle.id);
      assert.deepEqual(list.map((c) => c.body), ["first", "reply to first", "reply to the reply", "second"]);
      await assert.rejects(addComment(owner, angle.id, "x", "not-a-comment"), CommentError);
      assert.ok(c2);
    });

    await check("comment likes: once per person, can be taken back", async () => {
      const [first] = await listComments(owner, angle.id);
      assert.deepEqual(await setCommentLike(owner, first.id, true), { likes: 1, liked: true });
      assert.deepEqual(await setCommentLike(owner, first.id, true), { likes: 1, liked: true });
      assert.deepEqual(await setCommentLike(other, first.id, true), { likes: 2, liked: true });
      const seen = (await listComments(owner, angle.id))[0];
      assert.equal(seen.likes, 2);
      assert.equal(seen.liked, true);
      assert.deepEqual(await setCommentLike(owner, first.id, false), { likes: 1, liked: false });
    });

    await check("deleting a comment takes its replies with it", async () => {
      const [first] = await listComments(owner, angle.id);
      await deleteComment(friend, first.id);
      assert.deepEqual((await listComments(owner, angle.id)).map((c) => c.body), ["second"]);
    });

    await check("the look: only the owner, known filters only", async () => {
      assert.deepEqual(await setAngleLook(owner, angle.id, "vintage", true), { filter: "vintage", stamp: true });
      await assert.rejects(setAngleLook(friend, angle.id, "warm", false), SoundError);
      await assert.rejects(setAngleLook(owner, angle.id, "nope", false), SoundError);
      assert.deepEqual(await setAngleLook(owner, angle.id, null, false), { filter: null, stamp: false });
    });

    await check("trending: ranked by the week's views, likes, comments and shares", async () => {
      const quiet = await db.angle.create({ data: { momentId: m.id, contributorId: friend.id, mediaType: "VIDEO", status: "READY", screening: "allowed" } });
      await db.angle.update({ where: { id: angle.id }, data: { shares: 3 } });
      await db.reaction.create({ data: { angleId: quiet.id, userId: other.id, kind: "HEART" } });
      const list = await trendingVideos(null, 50);
      const mine = list.findIndex((x) => x.id === angle.id);
      const theirs = list.findIndex((x) => x.id === quiet.id);
      assert.ok(mine >= 0 && theirs >= 0, "both listed");
      assert.ok(mine < theirs, "3 shares + a comment outrank one like");
      assert.equal(list[mine].shares, 3);
    });
  } finally {
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
