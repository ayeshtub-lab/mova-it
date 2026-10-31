// A visitor's hearts before a name (src/server/quiet-guest.ts, 2026-10-31): only a guest still called
// «ضيف ٤٢١٧» counts as unnamed; their first five hearts are free, the sixth asks a name; a named
// guest has no limit. Also the guest tour's two small fixes: the wheel's whole-word names, and the
// small card picture for grids.
// Run: npx tsx tests/quiet-guest.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { unnamedGuest } from "../src/lib/guest-name";
import { cardImage } from "../src/lib/card-styles";
import { lines } from "../src/app/LiveWheel";
import { FREE_LIKES, needsName } from "../src/server/quiet-guest";
import { smallCardPath } from "../src/server/cards";

const TAG = "[quiettest]";
let n = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("PASS " + name);
};

async function main() {
  await check("only an auto-named guest is unnamed", async () => {
    assert.equal(unnamedGuest({ isGuest: true, displayName: "ضيف 4217" }), true);
    assert.equal(unnamedGuest({ isGuest: true, displayName: "Guest 1234" }), true);
    assert.equal(unnamedGuest({ isGuest: true, displayName: "سلمى" }), false);
    assert.equal(unnamedGuest({ isGuest: true, displayName: "ضيف الشرف" }), false);
    assert.equal(unnamedGuest({ isGuest: false, displayName: "ضيف 4217" }), false);
  });

  await check("the wheel shows whole words, without the words kept for search engines", async () => {
    assert.deepEqual(lines("صور حقيقية قهوة الصباح", 12), ["قهوة الصباح"]);
    assert.deepEqual(lines("صور قهوة حقيقية مع كتاب مفتوح", 12), ["قهوة مع كتاب", "مفتوح"]);
    assert.deepEqual(lines("صور حقيقية من الخريف على زاومو", 8), ["الخريف"]);
    assert.deepEqual(lines("صور", 8), ["صور"]);
    for (const t of ["صور وفيديو حقيقي للطبيعة", "هدوء فصل الخريف", "منظور الارض تصوير عين النملة"]) assert.ok(!lines(t, 8).join(" ").includes("…"), t);
  });

  await check("a card has a small picture beside it, at its own address", async () => {
    assert.equal(smallCardPath("cards/abc.jpg"), "cards/abc-small.jpg");
    assert.equal(smallCardPath("cards/abc-mvp1.jpg"), "cards/abc-mvp1-small.jpg");
    assert.equal(cardImage({ id: "abc", imagePath: "cards/abc.jpg" }, true), "/i/card-abc-small.jpg");
    assert.equal(cardImage({ id: "abc", imagePath: "cards/abc-mvp1.jpg" }, true), "/i/card-abc-small.jpg?v=mvp1");
    assert.equal(cardImage({ id: "abc", imagePath: "cards/abc.jpg" }), "/i/card-abc.jpg");
  });

  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: true } });
  const quiet = await db.user.create({ data: { displayName: "ضيف 9876", isGuest: true } });
  const named = await db.user.create({ data: { displayName: `${TAG} سلمى`, isGuest: true } });
  try {
    const m = await db.moment.create({ data: { code: `QG${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: owner.id, visibility: "PUBLIC" } as never });
    const angles = await Promise.all(
      Array.from({ length: FREE_LIKES }, (_, i) => db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", mediaPath: `quiettest/${i}.jpg` } as never })),
    );
    const like = (userId: string, count: number) => db.reaction.createMany({ data: angles.slice(0, count).map((a) => ({ angleId: a.id, userId, kind: "HEART" as const })) });

    await check(`an unnamed guest's first ${FREE_LIKES} hearts are free, then a name is asked`, async () => {
      await like(quiet.id, FREE_LIKES - 1);
      assert.equal(await needsName(quiet), false);
      await db.reaction.deleteMany({ where: { userId: quiet.id } });
      await like(quiet.id, FREE_LIKES);
      assert.equal(await needsName(quiet), true);
    });

    await check("a guest with a name has no limit", async () => {
      await like(named.id, FREE_LIKES);
      assert.equal(await needsName(named), false);
    });
  } finally {
    const ids = [owner.id, quiet.id, named.id];
    await db.reaction.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
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
