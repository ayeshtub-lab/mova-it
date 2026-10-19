// Integration test: the sitemap as the site writes it (src/app/sitemap.xml/route.ts) meets Google's
// schemas (src/lib/seo-spec.ts) — with a public moment holding a photo and a video, so its image and
// video entries are there to be checked. Run: npx tsx tests/sitemap-spec.integration.ts
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { GET } from "../src/app/sitemap.xml/route";
import { sitemapProblems } from "../src/lib/seo-spec";

const TAG = "[smtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  try {
    const m = await db.moment.create({ data: { code: `SM${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} قهوة & «حلويات» <صباح>`, named: true, visibility: "PUBLIC", status: "ACTIVE", creatorId: owner.id } });
    const shot = (mediaType: "PHOTO" | "VIDEO") =>
      db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType, status: "READY", screening: "allowed", mediaPath: `m/${m.id}/x.${mediaType === "VIDEO" ? "mp4" : "jpg"}`, thumbPath: mediaType === "VIDEO" ? `m/${m.id}/x-poster.jpg` : null, durationSec: mediaType === "VIDEO" ? 12.4 : null, aiTitle: `${TAG} ${"عنوان طويل جدا ".repeat(10)}` } });
    await shot("PHOTO");
    await shot("VIDEO");

    await check("the sitemap the site writes meets Google's schemas, a video and odd characters included", async () => {
      const res = await GET();
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /xml/);
      const xml = await res.text();
      assert.ok(xml.includes(`/m/${m.code}`), "the test moment is listed");
      assert.ok(/<video:video>/.test(xml), "a video entry is there");
      assert.deepEqual(sitemapProblems(xml), []);
    });
  } finally {
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
