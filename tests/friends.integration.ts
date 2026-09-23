// Integration test for src/server/friends.ts against the real database.
// Run: npx tsx tests/friends.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { FriendError, friendsActivity, friendsOf, friendsToInvite, inviteFriends } from "../src/server/friends";
import { createMoment } from "../src/server/moments";

const TAG = "[frtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const [salma, karim, nour, stranger] = await Promise.all(
    ["salma", "karim", "nour", "stranger"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}` } })),
  );
  const ids = [salma.id, karim.id, nour.id, stranger.id];
  try {
    // Salma and Karim shared an earlier moment → they are friends. Nour only shares with Karim.
    const past = await createMoment(salma, { title: "past", visibility: "LINK" });
    await db.participant.create({ data: { momentId: past.id, userId: karim.id, role: "CONTRIBUTOR" } });
    const other = await createMoment(karim, { title: "other", visibility: "LINK" });
    await db.participant.create({ data: { momentId: other.id, userId: nour.id, role: "CONTRIBUTOR" } });

    await check("friends = people you shared a moment with (not strangers, not yourself)", async () => {
      assert.deepEqual((await friendsOf(salma)).map((f) => f.id), [karim.id]);
      assert.deepEqual(new Set((await friendsOf(karim)).map((f) => f.id)), new Set([salma.id, nour.id]));
      assert.deepEqual(await friendsOf(stranger), []);
    });

    const now = await createMoment(salma, { title: "غروب", visibility: "LINK" });

    await check("suggestions exclude people already in the moment", async () => {
      assert.deepEqual((await friendsToInvite(salma, now.code)).map((f) => f.id), [karim.id]);
      await db.participant.create({ data: { momentId: now.id, userId: karim.id, role: "VIEWER" } });
      assert.deepEqual(await friendsToInvite(salma, now.code), []);
      await db.participant.delete({ where: { momentId_userId: { momentId: now.id, userId: karim.id } } });
    });

    await check("invite: only real friends, once each; strangers and non-members are refused", async () => {
      assert.deepEqual(await inviteFriends(salma, now.code, [karim.id, stranger.id, nour.id]), { sent: 1 });
      assert.deepEqual(await inviteFriends(salma, now.code, [karim.id]), { sent: 0 });
      await assert.rejects(inviteFriends(stranger, now.code, [salma.id]), (e) => e instanceof FriendError && e.code === "forbidden");
      await assert.rejects(inviteFriends(salma, now.code, "not-a-list"), FriendError);
    });

    await check("home: invited friend sees 'sent you', even for a link-only moment", async () => {
      const items = await friendsActivity(karim);
      const item = items.find((i) => i.code === now.code);
      assert.equal(item?.reason, "invite");
      assert.equal(item?.fromName, `${TAG} salma`);
    });

    await check("home: link-only moments are never auto-shown to friends who were not invited", async () => {
      const lone = await createMoment(karim, { title: "link only", visibility: "LINK" });
      assert.ok(!(await friendsActivity(salma)).some((i) => i.code === lone.code));
    });

    await check("home: a friend's new friends-only moment shows as 'started'", async () => {
      const fm = await createMoment(karim, { title: "friends", visibility: "FRIENDS" });
      const item = (await friendsActivity(salma)).find((i) => i.code === fm.code);
      assert.equal(item?.reason, "friend");
      assert.ok(!(await friendsActivity(stranger)).some((i) => i.code === fm.code));
    });

    await check("home: once you take part, the invite disappears", async () => {
      await db.participant.create({ data: { momentId: now.id, userId: karim.id, role: "CONTRIBUTOR" } });
      assert.ok(!(await friendsActivity(karim)).some((i) => i.code === now.code));
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
