// A profile's lists past their first page (2026-11-03): the shot count is the true one (it stood
// at 60), «عرض المزيد» brings the rest of the shots and of what you liked (the 61st heart used to
// vanish from «أعجبني»), and the hearts a member gave as a guest come with them when they sign
// in with Google to the account they already have.
// Run: npx tsx tests/profile-pages.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { accountForGoogle } from "../src/server/google";
import { getProfile, profileMore, ProfileError } from "../src/server/profile";

const TAG = "[pagestest]";
const SUB = `pagestest-${Date.now()}`;
let n = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("PASS " + name);
};

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const visitor = await db.user.create({ data: { displayName: `${TAG} visitor`, isGuest: false } });
  const member = await db.user.create({ data: { displayName: `${TAG} member`, isGuest: false, googleSub: SUB } });
  const guest = await db.user.create({ data: { displayName: "ضيف 5150", isGuest: true } });
  const ids = [owner.id, visitor.id, member.id, guest.id];
  try {
    const m = await db.moment.create({ data: { code: `PP${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: owner.id, visibility: "PUBLIC" } as never });
    await db.participant.create({ data: { momentId: m.id, userId: owner.id } as never });
    const at = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 60_000);
    await db.angle.createMany({
      data: Array.from({ length: 65 }, (_, i) => ({ momentId: m.id, contributorId: owner.id, mediaType: "PHOTO" as const, status: "READY" as const, mediaPath: `pagestest/${i}.jpg`, uploadedAt: at(i) })),
    });
    const angles = await db.angle.findMany({ where: { momentId: m.id }, orderBy: { uploadedAt: "desc" }, select: { id: true } });

    await check("the shot count is every visible shot, the page the first 60, then the rest", async () => {
      const p = (await getProfile(visitor, owner.id))!;
      assert.equal(p.shotCount, 65);
      assert.equal(p.shots.length, 60);
      assert.equal(p.more.shots, true);
      assert.equal(p.momentCount, 1);
      assert.equal(p.more.moments, false);
      const next = await profileMore(visitor, owner.id, "shots", 60);
      assert.equal(next.more, false);
      assert.deepEqual([...p.shots, ...(next.items as { id: string }[])].map((s) => s.id), angles.map((a) => a.id), "newest first, none twice, none missing");
    });

    await check("«أعجبني» pages too, and is its owner's alone", async () => {
      await db.reaction.createMany({ data: angles.map((a, i) => ({ angleId: a.id, userId: visitor.id, kind: "HEART" as const, createdAt: at(i) })) });
      const me = (await getProfile(visitor, visitor.id))!;
      assert.equal(me.likes!.length, 60);
      assert.equal(me.more.likes, true);
      const rest = await profileMore(visitor, visitor.id, "likes", 60);
      assert.equal(rest.items.length, 5);
      assert.equal(rest.more, false);
      assert.equal(new Set([...me.likes!, ...(rest.items as { id: string }[])].map((l) => l.id)).size, 65);
      await assert.rejects(profileMore(owner, visitor.id, "likes", 0), ProfileError);
      await assert.rejects(profileMore(null, visitor.id, "saved", 0), ProfileError);
      await assert.rejects(profileMore(visitor, owner.id, "shots", -1), ProfileError);
    });

    await check("a guest's hearts and saves move to the Google account they sign in to", async () => {
      await db.reaction.createMany({ data: [0, 1, 2].map((i) => ({ angleId: angles[i].id, userId: guest.id, kind: "HEART" as const })) });
      await db.reaction.create({ data: { angleId: angles[0].id, userId: member.id, kind: "HEART" } }); // given both ways
      await db.savedAngle.create({ data: { angleId: angles[3].id, userId: guest.id } });
      const signedIn = await accountForGoogle(guest, { sub: SUB, email: null, name: "x" }, "ar");
      assert.equal(signedIn.id, member.id);
      const hearts = await db.reaction.findMany({ where: { userId: member.id }, select: { angleId: true } });
      assert.deepEqual(new Set(hearts.map((h) => h.angleId)), new Set([0, 1, 2].map((i) => angles[i].id)), "one heart each, none lost");
      assert.equal(await db.reaction.count({ where: { userId: guest.id } }), 0);
      assert.equal(await db.savedAngle.count({ where: { userId: member.id, angleId: angles[3].id } }), 1);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: guest.id } })).isGuest, true, "the guest account stays as it was");
    });
  } finally {
    await db.reaction.deleteMany({ where: { userId: { in: ids } } });
    await db.savedAngle.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`${n} checks`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
