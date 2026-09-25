// Integration test for src/server/profile.ts against the real database.
// Run: npx tsx tests/profile.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { accountForGoogle } from "../src/server/google";
import { blockUser } from "../src/server/moderation";
import { listTag } from "../src/server/discover";
import { createMoment, getMomentView, MomentError } from "../src/server/moments";
import { ReactionError, setReaction, setSaved } from "../src/server/reactions";
import { getProfile, ProfileError, recordViews, setAvatar, setDisplayName, setFollow } from "../src/server/profile";

const TAG = "[proftest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const isProfile = (code: string) => (e: unknown) => e instanceof ProfileError && e.code === code;

async function main() {
  const mk = (n: string, isGuest = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest } });
  const [owner, friend, stranger, host, guest] = await Promise.all([mk("owner"), mk("friend"), mk("stranger"), mk("host"), mk("guest", true)]);
  const ids = [owner.id, friend.id, stranger.id, host.id, guest.id];
  const angle = (momentId: string, userId: string, minute: number) =>
    db.angle.create({ data: { momentId, contributorId: userId, mediaType: "PHOTO", status: "READY", capturedAt: new Date(Date.UTC(2026, 8, 24, 10, minute)) } });
  try {
    // Owner and friend shared an earlier moment → friends.
    const past = await createMoment(owner, { title: "past", visibility: "LINK" });
    await db.participant.create({ data: { momentId: past.id, userId: friend.id, role: "CONTRIBUTOR" } });

    const pub = await createMoment(owner, { title: "public", visibility: "PUBLIC" });
    const fr = await createMoment(owner, { title: "friends", visibility: "FRIENDS" });
    const link = await createMoment(owner, { title: "link", visibility: "LINK" });
    const pubA = await angle(pub.id, owner.id, 1);
    const frA = await angle(fr.id, owner.id, 1);
    const linkA = await angle(link.id, owner.id, 1);
    // A moment by someone else (host) where the owner's angle is NOT the first one.
    const other = await createMoment(host, { title: "host's", visibility: "PUBLIC" });
    await angle(other.id, host.id, 1);
    await db.participant.create({ data: { momentId: other.id, userId: owner.id, role: "CONTRIBUTOR" } });
    const lateA = await angle(other.id, owner.id, 5);

    const shotIds = async (viewer: typeof owner | null) => new Set((await getProfile(viewer, owner.id))!.shots.map((s) => s.id));

    await check("guests have no profile page", async () => {
      assert.equal(await getProfile(owner, guest.id), null);
      assert.equal(await getProfile(null, "nope"), null);
    });

    await check("owner sees all their shots, including link-only ones and later angles", async () => {
      assert.deepEqual(await shotIds(owner), new Set([pubA.id, frA.id, linkA.id, lateA.id]));
    });

    await check("visitor: only public moments — and public moments are fully open", async () => {
      assert.deepEqual(await shotIds(null), new Set([pubA.id, lateA.id]));
      assert.deepEqual(await shotIds(stranger), new Set([pubA.id, lateA.id]));
      // Host shares a moment with the owner (so: a friend) and created it (so: unlocked).
      assert.deepEqual(await shotIds(host), new Set([pubA.id, frA.id, lateA.id]));
    });

    await check("friend: public + friends-only, never link-only", async () => {
      assert.deepEqual(await shotIds(friend), new Set([pubA.id, frA.id, lateA.id])); // lateA is in a public moment
      const moments = (await getProfile(friend, owner.id))!.moments.map((m) => m.code);
      assert.ok(moments.includes(fr.code) && !moments.includes(link.code));
      // "past" is link-only too, but the friend is in it, so they may see it.
      assert.ok(moments.includes(past.code));
    });

    await check("counts are public; what you liked and saved stays yours", async () => {
      await db.reaction.create({ data: { angleId: lateA.id, userId: owner.id, kind: "FIRE" } }); // an old-style reaction still counts
      await setReaction(friend, pubA.id, true);
      await setReaction(friend, pubA.id, true); // once per person
      const mine = (await getProfile(owner, owner.id))!;
      assert.deepEqual(mine.likes?.map((l) => l.id), [lateA.id]);
      const seen = (await getProfile(friend, owner.id))!;
      assert.equal(seen.likes, null);
      assert.equal(seen.saved, null);
      assert.equal(seen.likesReceived, 2); // pubA by friend + lateA by owner
      assert.ok(seen.shots.every((s) => typeof s.views === "number"));
      assert.equal(seen.googleName, null);
      const liked = (await getMomentView(pub.code, friend))!.angles[0].likes;
      assert.deepEqual(liked, { count: 1, liked: true });
      assert.deepEqual(await setReaction(friend, pubA.id, false), { count: 0, liked: false });
      await assert.rejects(setReaction(friend, pubA.id, "HEART"), ReactionError);
    });

    await check("saved: private, only what you may see, toggles", async () => {
      await setSaved(friend, pubA.id, true);
      await setSaved(friend, pubA.id, true);
      const linkB = await angle(link.id, owner.id, 3); // second angle: locked until you add yours
      await assert.rejects(setSaved(stranger, linkB.id, true), ReactionError);
      assert.equal((await getMomentView(pub.code, friend))!.angles[0].saved, true);
      const me = (await getProfile(friend, friend.id))!;
      assert.deepEqual(me.saved?.map((s) => s.id), [pubA.id]);
      await setSaved(friend, pubA.id, false);
      assert.deepEqual((await getProfile(friend, friend.id))!.saved, []);
    });

    await check("profile photo: official accounts only, a real small JPEG only", async () => {
      await assert.rejects(setAvatar(guest, Buffer.from([0xff, 0xd8, 0xff, 0])), isProfile("forbidden"));
      await assert.rejects(setAvatar(owner, Buffer.from("not a jpeg")), isProfile("invalid"));
      await assert.rejects(setAvatar(owner, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(700 * 1024)])), isProfile("invalid"));
    });

    await check("description with #hashtags; the tag page lists public, checked moments", async () => {
      await assert.rejects(createMoment(owner, { title: "t", description: "x".repeat(151) }), (e) => e instanceof MomentError && e.code === "invalid_description");
      const tagged = await createMoment(owner, { title: "tagged", description: `sunset ${TAG} #ProfTestSea #بحر_تست` });
      assert.equal((await getMomentView(tagged.code, owner))!.description, `sunset ${TAG} #ProfTestSea #بحر_تست`);
      await db.angle.create({ data: { momentId: tagged.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed" } });
      assert.deepEqual(await listTag(friend, "proftestsea"), [], "friends-only: not on the tag page");
      await db.moment.update({ where: { id: tagged.id }, data: { visibility: "PUBLIC" } });
      assert.deepEqual((await listTag(friend, "proftestsea")).map((m) => m.code), [tagged.code]);
      assert.deepEqual((await listTag(friend, "بحر_تست")).map((m) => m.code), [tagged.code]);
      assert.deepEqual(await listTag(friend, "proftests"), [], "exact tags only");
    });

    await check("views: once per person, never your own, only what you may see", async () => {
      assert.deepEqual(await recordViews(friend, [frA.id, frA.id, pubA.id]), { recorded: 2 });
      assert.deepEqual(await recordViews(friend, [frA.id]), { recorded: 1 }); // counted once anyway
      assert.deepEqual(await recordViews(owner, [frA.id]), { recorded: 0 }); // own angle
      await db.participant.create({ data: { momentId: other.id, userId: friend.id, role: "VIEWER" } });
      assert.deepEqual(await recordViews(friend, [lateA.id]), { recorded: 1 }); // public moment: open to all
      await assert.rejects(recordViews(friend, "x"), isProfile("invalid"));
      const views = new Map((await getProfile(owner, owner.id))!.shots.map((s) => [s.id, s.views]));
      assert.equal(views.get(frA.id), 1);
      assert.equal(views.get(pubA.id), 1);
      const view = await getMomentView(fr.code, owner);
      assert.equal(view?.angles[0].views, 1);
      assert.equal((await getMomentView(fr.code, friend))?.angles[0].views, 1); // public count
    });

    await check("follow / unfollow; can't follow yourself or a guest", async () => {
      await setFollow(friend, owner.id, true);
      await setFollow(friend, owner.id, true);
      let p = (await getProfile(friend, owner.id))!;
      assert.equal(p.followers, 1);
      assert.equal(p.isFollowing, true);
      await setFollow(friend, owner.id, false);
      p = (await getProfile(friend, owner.id))!;
      assert.equal(p.followers, 0);
      await assert.rejects(setFollow(owner, owner.id, true), isProfile("invalid"));
      await assert.rejects(setFollow(owner, guest.id, true), isProfile("not_found"));
    });

    await check("blocked people can't see the profile or follow", async () => {
      await blockUser(owner, stranger.id);
      assert.equal(await getProfile(stranger, owner.id), null);
      await assert.rejects(setFollow(stranger, owner.id, true), isProfile("not_found"));
    });

    await check("rename, and the Google name is kept for a one-tap switch", async () => {
      await setDisplayName(owner, `  ${TAG} new   name `);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).displayName, `${TAG} new name`);
      await assert.rejects(setDisplayName(owner, "   "), isProfile("invalid"));
      const g = await accountForGoogle(guest, { sub: `proftest-${Date.now()}`, email: null, name: `${TAG} Qasem Ayesh`, picture: "https://lh3.googleusercontent.com/a/x" }, "ar");
      assert.equal(g.displayName, `${TAG} guest`, "keeps the chosen name");
      assert.equal(g.googleName, `${TAG} Qasem Ayesh`);
      assert.equal(g.avatarUrl, "https://lh3.googleusercontent.com/a/x");
      assert.equal((await getProfile(g, g.id))?.googleName, `${TAG} Qasem Ayesh`);
    });
  } finally {
    await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.follow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] } });
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
