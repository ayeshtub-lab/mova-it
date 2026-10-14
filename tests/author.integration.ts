// Integration test for members' pages in search (src/server/seo.ts publicAuthor/sitemapAuthors):
// only public, checked shots count — a member with none (only friends' moments, or a guest) is
// neither indexed nor listed; the places come from their public shots.
// Run: npx tsx tests/author.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { publicAuthor, sitemapAuthors } from "../src/server/seo";

const TAG = "[authortest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string, isGuest = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest } });
  const [shooter, quiet, guest] = [await mk("shooter"), await mk("quiet"), await mk("guest", true)];
  const ids = [shooter.id, quiet.id, guest.id];
  const place = await db.place.create({ data: { id: `authortest-${Date.now()}`, slug: `authortest-${Date.now()}`, nameAr: "قرية الاختبار", kind: "TOWN", countryCode: "PS", search: "قرية الاختبار", lat: 31.7, lng: 35.2 } });
  try {
    const moment = (by: string, visibility: string) => db.moment.create({ data: { code: `AU${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "غروب", creatorId: by, visibility } as never });
    const shot = (momentId: string, by: string) => db.angle.create({ data: { momentId, contributorId: by, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "authortest/x.jpg", placeId: place.id } });
    await shot((await moment(shooter.id, "PUBLIC")).id, shooter.id);
    await shot((await moment(quiet.id, "FRIENDS")).id, quiet.id);
    await shot((await moment(guest.id, "PUBLIC")).id, guest.id);

    await check("a public shot makes a member findable, with its place", async () => {
      const a = await publicAuthor(shooter.id);
      assert.equal(a.shots, 1);
      assert.deepEqual(a.places, ["قرية الاختبار"]);
    });
    await check("friends-only shots and guests stay out of search", async () => {
      assert.equal((await publicAuthor(quiet.id)).shots, 0);
      assert.equal((await publicAuthor(guest.id)).shots, 0);
      const listed = new Set((await sitemapAuthors()).map((x) => x.id));
      assert.ok(listed.has(shooter.id));
      assert.ok(!listed.has(quiet.id) && !listed.has(guest.id));
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.place.delete({ where: { id: place.id } }).catch(() => {});
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
