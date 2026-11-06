// Integration test: «زاوية الموسم» (src/server/seasons.ts, 2026-11-06). A season gathers the public
// moments whose hashtags carry one of its words — in the description (all its pictures) or in a
// picture's own line (only those) — never a private moment nor a look-alike tag; its cover is a
// picture of the season; the pinned moments come first. Test database only.
// Run: npx tsx tests/seasons.integration.ts — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { computeSeasonMoments } from "../src/server/seasons";
import { createMoment } from "../src/server/moments";

const TAG = "[seasontest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  try {
    const mk = (title: string, visibility: "PUBLIC" | "FRIENDS" = "PUBLIC") => createMoment(owner, { title: `${TAG} ${title}`, visibility });
    const shot = (momentId: string, aiText: string) => db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x", aiText } });
    const [mixed, wholly, seedling, hidden, plainOne] = await Promise.all([mk("coffee and one rainy sky"), mk("winter evening"), mk("seedlings"), mk("rain for friends", "FRIENDS"), mk("pinned coffee")]);
    await db.moment.update({ where: { id: wholly.id }, data: { description: "مسا الشتاء #ليالي_الشتاء" } });
    const coffee = await shot(mixed.id, "قهوة الصبح #قهوة");
    const rain = await shot(mixed.id, "شباك والمطر نازل #صوت_المطر");
    await shot(mixed.id, "قهوة تانية #قهوة");
    await shot(wholly.id, "صوبة #دفا");
    await shot(wholly.id, "كاسة شاي #شاي");
    await shot(seedling.id, "شتلة #شتلة_زيتون #قهوة_مثلجة");
    await shot(hidden.id, "مطر #مطر");
    await shot(plainOne.id, "قهوة #قهوة");
    const words = ["الشتاء", "شتاء", "المطر", "مطر"];

    await check("the season's moments: by a picture's line or the description; no look-alike, nothing private", async () => {
      const { moments } = await computeSeasonMoments(words, []);
      const codes = moments.map((m) => m.code);
      assert.ok(codes.includes(mixed.code) && codes.includes(wholly.code));
      for (const m of [seedling, hidden, plainOne]) assert.ok(!codes.includes(m.code), m.title);
    });

    await check("only the season's pictures count, and the cover is one of them", async () => {
      const { moments } = await computeSeasonMoments(words, []);
      const m = moments.find((x) => x.code === mixed.code)!;
      assert.equal(m.shots, 1, "one rainy picture among the coffee");
      assert.equal(m.coverUrl, `/i/${rain.id}-small.jpg`);
      assert.notEqual(m.coverUrl, `/i/${coffee.id}-small.jpg`);
      assert.equal(moments.find((x) => x.code === wholly.code)!.shots, 2, "the description says winter: all its pictures");
    });

    await check("pinned moments first, in the admin's order, even without the words", async () => {
      const { moments } = await computeSeasonMoments(words, [plainOne.code, wholly.code]);
      assert.deepEqual(moments.slice(0, 2).map((m) => m.code), [plainOne.code, wholly.code]);
      assert.ok(moments[0].pinned && !moments.find((m) => m.code === mixed.code)!.pinned);
    });

    await check("no words: nothing", async () => {
      assert.equal((await computeSeasonMoments([], [])).moments.length, 0);
    });
  } finally {
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } });
    out.push("CLEANUP ok");
  }
  console.log(out.join("\n"));
  console.log(`${out.filter((l) => l.startsWith("PASS")).length} checks`);
}

main()
  .catch((error) => {
    console.error("FAIL", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
