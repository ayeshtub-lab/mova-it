// «👤 أشخاص» in the search (src/server/moment-search.ts findPeople, 2026-11-01): a member is found
// by name, however it was spelled, only with a profile (no guest) and a public shot — one who shares
// nothing publicly can't be found — never one the viewer blocked.
// Run: npx tsx tests/people-search.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { findPeople } from "../src/server/moment-search";

const TAG = "زيتونتست";
let n = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("PASS " + name);
};

async function main() {
  const sharer = await db.user.create({ data: { displayName: `${TAG} سلمى`, isGuest: false } });
  const quiet = await db.user.create({ data: { displayName: `${TAG} سارة`, isGuest: false } });
  const guest = await db.user.create({ data: { displayName: `${TAG} ضيفة`, isGuest: true } });
  const viewer = await db.user.create({ data: { displayName: "viewer", isGuest: false } });
  const ids = [sharer.id, quiet.id, guest.id, viewer.id];
  try {
    const pub = await db.moment.create({ data: { code: `PS${Date.now().toString(36).slice(-4).toUpperCase()}`, title: "x", creatorId: sharer.id, visibility: "PUBLIC" } as never });
    const priv = await db.moment.create({ data: { code: `PT${Date.now().toString(36).slice(-4).toUpperCase()}`, title: "y", creatorId: quiet.id, visibility: "FRIENDS" } as never });
    const shot = (momentId: string, contributorId: string) => db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "peopletest/x.jpg" } as never });
    await shot(pub.id, sharer.id);
    await shot(pub.id, guest.id);
    await shot(priv.id, quiet.id);

    await check("a member with a public shot is found, by any spelling of the name", async () => {
      const found = await findPeople(null, `${TAG} سلمي`);
      assert.deepEqual(found.map((p) => p.id), [sharer.id]);
      assert.equal(found[0].shots, 1);
    });
    await check("one with no public shot, and a guest, are never found", async () => {
      const found = (await findPeople(null, TAG)).map((p) => p.id);
      assert.ok(found.includes(sharer.id));
      assert.ok(!found.includes(quiet.id), "no public shot");
      assert.ok(!found.includes(guest.id), "guest");
    });
    await check("someone the viewer blocked is not found", async () => {
      await db.block.create({ data: { blockerId: viewer.id, blockedId: sharer.id } } as never);
      assert.equal((await findPeople(viewer, TAG)).length, 0);
    });
    await check("no words, no people", async () => {
      assert.deepEqual(await findPeople(null, "   "), []);
    });
  } finally {
    await db.block.deleteMany({ where: { blockerId: viewer.id } }).catch(() => {});
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
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
