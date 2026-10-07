// Integration test for «📍 وين صوّرتهن؟» (src/server/unplaced.ts): my public shots without a
// place, grouped by moment, sky shots first; friends-only, placed or others' shots never; and
// who gets asked once (owners of public sky shots without a place).
// Run: npx tsx tests/unplaced.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { skyShotOwnersWithoutPlace, unplacedCount, unplacedShots } from "../src/server/unplaced";

const TAG = "[unplacedtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const [me, other] = await Promise.all(["me", "other"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } })));
  const ids = [me.id, other.id];
  try {
    const place = await db.place.findFirstOrThrow({ select: { id: true } });
    let n = 0;
    const moment = (creatorId: string, title: string, visibility = "PUBLIC") =>
      db.moment.create({ data: { code: `UP${Date.now().toString(36).slice(-3).toUpperCase()}${n++}`, title: `${TAG} ${title}`, creatorId, visibility } as never });
    const shot = (momentId: string, contributorId: string, extra: Record<string, unknown> = {}) =>
      db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `unplacedtest/${Math.random()}.jpg`, ...extra } as never });
    const food = await moment(me.id, "أكل");
    const sky = await moment(me.id, "غروب");
    const friends = await moment(me.id, "أصحاب", "FRIENDS");
    await shot(food.id, me.id, { scene: "food" });
    await shot(sky.id, me.id, { scene: "sunset" });
    await shot(sky.id, me.id, { scene: "sunset" });
    await shot(sky.id, me.id, { scene: "sunset", placeId: place.id }); // has a place
    await shot(friends.id, me.id, { scene: "sunset" }); // friends-only
    await shot(sky.id, other.id, { scene: "sunset" }); // someone else's

    await check("my public shots without a place, by moment, sky first", async () => {
      const groups = await unplacedShots(me.id);
      assert.deepEqual(groups.map((g) => [g.title, g.shots.length, g.sky]), [[`${TAG} غروب`, 2, true], [`${TAG} أكل`, 1, false]]);
      assert.equal(await unplacedCount(me.id), 3);
    });

    await check("asked once: owners of public sky shots without a place", async () => {
      const owners = await skyShotOwnersWithoutPlace();
      assert.equal(owners.get(me.id), 2);
      assert.equal(owners.get(other.id), 1);
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    out.push((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left users");
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
