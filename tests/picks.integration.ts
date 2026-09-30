// Integration test for «⭐ اختيار زاومو»: only official (verified) accounts pick; only public,
// checked, real shots can be picked; the owner hears of it once; picked shots lead the home
// wheel and the showcase, and the moment page shows the pick.
// Run: npx tsx tests/picks.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { publicShowcase, wheelShots } from "../src/server/discover";
import { getMomentView } from "../src/server/moments";
import { PickError, setPick } from "../src/server/picks";

const TAG = "[picktest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const official = await db.user.create({ data: { displayName: `${TAG} official`, isGuest: false, verified: true } });
  const person = await db.user.create({ data: { displayName: `${TAG} person`, isGuest: false } });
  const ids = [official.id, person.id];
  let n = 0;
  const moment = (data: Record<string, unknown>) =>
    db.moment.create({ data: { code: `PK${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: `${TAG} m`, creatorId: person.id, visibility: "PUBLIC", ...data } as never });
  const shot = (momentId: string, uploadedAt = new Date()) =>
    db.angle.create({ data: { momentId, contributorId: person.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `picktest/${Math.random()}.jpg`, uploadedAt } });
  try {
    const open = await moment({});
    // An older shot, so without the pick it would come after newer ones.
    const old = await shot(open.id, new Date(Date.now() - 20 * 24 * 3600 * 1000));
    const friends = await moment({ visibility: "FRIENDS" });
    const hidden = await shot(friends.id);
    const demo = await moment({ demo: true });
    const demoShot = await shot(demo.id);

    await check("only an official account may pick", async () => {
      await assert.rejects(setPick(person, old.id, true), (e) => e instanceof PickError && e.code === "forbidden");
      assert.equal((await getMomentView(open.code, person))!.viewer.canPick, false);
      assert.equal((await getMomentView(open.code, official))!.viewer.canPick, true);
    });
    await check("only public, real shots can be picked", async () => {
      await assert.rejects(setPick(official, hidden.id, true), (e) => e instanceof PickError && e.code === "not_found");
      await assert.rejects(setPick(official, demoShot.id, true), (e) => e instanceof PickError && e.code === "not_found");
    });
    await check("a pick shows on the moment page, and its owner hears of it once", async () => {
      await setPick(official, old.id, true);
      await setPick(official, old.id, false);
      await setPick(official, old.id, true);
      assert.equal((await getMomentView(open.code, null))!.angles.find((a) => a.id === old.id)?.picked, true);
      assert.equal(await db.notification.count({ where: { userId: person.id, kind: "PICKED", angleId: old.id } }), 1);
    });
    await check("a picked shot leads the home wheel and the showcase", async () => {
      assert.equal((await wheelShots(12))[0]?.id, old.id);
      const showcase = await publicShowcase(12);
      assert.equal(showcase[0]?.id, old.id);
      assert.equal(showcase[0]?.picked, true);
    });
  } finally {
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
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
