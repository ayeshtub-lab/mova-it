// Integration test: a public moment's film for search engines (src/server/seo.ts, publicMontage;
// /v/CODE.mp4; the sitemap's moment video) — its latest finished film only, and never a
// friends-only moment's. Test database only. Run: npx tsx tests/film-seo.integration.ts
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { publicMontage, sitemapEntries } from "../src/server/seo";

const TAG = "[filmtest]";
async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const n = Date.now().toString(36).slice(-3).toUpperCase().replace(/[01IOL]/g, "X");
  try {
    const moment = (code: string, visibility: string) => db.moment.create({ data: { code, title: "عرس ليلى", creatorId: owner.id, visibility } as never });
    const pub = await moment(`FP${n}A`.slice(0, 6), "PUBLIC");
    const friends = await moment(`FP${n}B`.slice(0, 6), "FRIENDS");
    await db.angle.create({ data: { momentId: pub.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "filmtest/a.jpg" } as never });
    assert.equal(await publicMontage(pub.code), null, "no film yet");
    await db.montage.create({ data: { momentId: pub.id, status: "RENDERING", angleIds: [] } as never });
    assert.equal(await publicMontage(pub.code), null, "an unfinished film isn't one");
    await db.montage.create({ data: { momentId: pub.id, status: "READY", videoUrl: `m/${pub.id}/montage-1.mp4`, durationSec: 31.4, finishedAt: new Date(), angleIds: [] } as never });
    await db.montage.create({ data: { momentId: friends.id, status: "READY", videoUrl: `m/${friends.id}/montage-1.mp4`, durationSec: 20, finishedAt: new Date(), angleIds: [] } as never });
    const film = await publicMontage(pub.code);
    assert.equal(film?.path, `m/${pub.id}/montage-1.mp4`);
    assert.equal(film?.durationSec, 31.4);
    assert.equal(await publicMontage(friends.code), null, "a friends-only moment's film is never listed");
    const listed = (await sitemapEntries()).moments.find((m) => m.code === pub.code);
    assert.ok(listed?.film, "the sitemap lists its film");
    console.log("PASS a public moment's finished film is listed (page, /v/CODE.mp4, sitemap); never an unfinished or friends-only one");
  } finally {
    await db.montage.deleteMany({ where: { moment: { creatorId: owner.id } } });
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    console.log((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left users");
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.log("FAIL", error);
  process.exit(1);
});
