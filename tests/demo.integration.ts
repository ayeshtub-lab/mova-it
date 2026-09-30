// Integration test for illustrative (AI-made) example moments (Moment.demo): they open by
// their link, marked as such, but are never listed with real people's moments — not in the
// home wheel, the showcase, the feed, the stories, the sitemap, or as a search-engine page.
// Run: npx tsx tests/demo.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { listFeed, getMomentView } from "../src/server/moments";
import { publicShowcase, wheelShots } from "../src/server/discover";
import { momentIndexable, publicShot, sitemapEntries, sitemapShots } from "../src/server/seo";
import { publicStories } from "../src/server/stories";

const TAG = "[demotest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  let n = 0;
  const moment = (data: Record<string, unknown>) =>
    db.moment.create({ data: { code: `DM${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: `${TAG} m`, creatorId: owner.id, visibility: "PUBLIC", ...data } as never });
  const shot = (momentId: string, mediaType: "PHOTO" | "VIDEO" = "PHOTO") =>
    db.angle.create({ data: { momentId, contributorId: owner.id, mediaType, status: "READY", screening: "allowed", mediaPath: `demotest/${Math.random()}.jpg`, thumbPath: `demotest/${Math.random()}.jpg` } });
  try {
    const real = await moment({});
    const realShot = await shot(real.id);
    const demo = await moment({ demo: true });
    const demoShot = await shot(demo.id, "VIDEO");
    const demoStory = await moment({ demo: true, kind: "STORY" });
    await shot(demoStory.id);

    await check("a demo moment opens by its link, marked as a demo", async () => {
      const view = await getMomentView(demo.code, null);
      assert.ok(view);
      assert.equal(view.demo, true);
      assert.equal(momentIndexable(view), false, "never a search-engine page");
      assert.equal(momentIndexable((await getMomentView(real.code, null))!), true);
    });
    await check("not in the home wheel or the showcase", async () => {
      const wheel = (await wheelShots(500)).map((s) => s.id);
      const showcase = (await publicShowcase(500)).map((s) => s.id);
      assert.ok(wheel.includes(realShot.id), "the real shot is there");
      assert.ok(!wheel.includes(demoShot.id));
      assert.ok(!showcase.includes(demoShot.id));
    });
    await check("not in the feed or the public stories", async () => {
      const feed = (await listFeed(null, 500)).map((m) => m.code);
      assert.ok(!feed.includes(demo.code));
      assert.ok(!(await publicStories(500)).some((s) => s.code === demoStory.code));
    });
    await check("not in the sitemap, and no shot page or fixed media address", async () => {
      const { moments } = await sitemapEntries();
      assert.ok(moments.some((m) => m.code === real.code));
      assert.ok(!moments.some((m) => m.code === demo.code));
      assert.ok(!(await sitemapShots()).some((s) => s.id === demoShot.id));
      assert.equal(await publicShot(demoShot.id), null);
      assert.ok(await publicShot(realShot.id));
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } });
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
