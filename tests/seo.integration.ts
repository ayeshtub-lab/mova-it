// Integration test for what search engines see: the sitemap lists public moments with a
// checked shot and the places (and their parents) where public shots were taken — never
// friends-only, hidden, «لحظة اليوم» or unchecked ones — and only public pages are indexable.
// Run: npx tsx tests/seo.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { momentIndexable, sitemapEntries } from "../src/server/seo";

const TAG = "[seotest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const idOf = async (nameAr: string, kind: string) => (await db.place.findFirstOrThrow({ where: { nameAr, countryCode: "PS", kind: kind as never } })).id;

async function main() {
  if ((await db.place.count()) < 1000) throw new Error("the test database has no places: run `npx tsx tools/places/seed.ts --db=test`");
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const [artas, gov] = [await idOf("أرطاس", "VILLAGE"), await idOf("بيت لحم", "GOVERNORATE")];
  let n = 0;
  const moment = (data: Record<string, unknown>) =>
    db.moment.create({ data: { code: `SEO${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: `${TAG} m`, creatorId: owner.id, ...data } as never });
  const shot = (momentId: string, data: Record<string, unknown> = {}) =>
    db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", placeId: artas, ...data } as never });
  try {
    const open = await moment({ visibility: "PUBLIC" });
    await shot(open.id);
    const friends = await moment({ visibility: "FRIENDS" });
    await shot(friends.id);
    const hidden = await moment({ visibility: "PUBLIC", status: "HIDDEN" });
    await shot(hidden.id);
    const daily = await moment({ visibility: "PUBLIC", kind: "DAILY" });
    await shot(daily.id);
    const unchecked = await moment({ visibility: "PUBLIC" });
    await shot(unchecked.id, { screening: null });
    const empty = await moment({ visibility: "PUBLIC" });

    const { moments, places } = await sitemapEntries();
    const codes = new Set(moments.map((m) => m.code));
    const slugs = new Set(places.map((p) => p.slug));

    await check("public moments with a checked shot are listed", async () => {
      assert.ok(codes.has(open.code));
    });
    await check("friends-only, hidden, «لحظة اليوم», unchecked and empty moments are not", async () => {
      for (const m of [friends, hidden, daily, unchecked, empty]) assert.ok(!codes.has(m.code), m.code);
    });
    await check("the shot's place and the places above it are listed", async () => {
      const [a, g] = await Promise.all([db.place.findUniqueOrThrow({ where: { id: artas } }), db.place.findUniqueOrThrow({ where: { id: gov } })]);
      assert.ok(slugs.has(a.slug), "أرطاس");
      assert.ok(slugs.has(g.slug), "محافظة بيت لحم");
    });
    await check("only public, non-daily moments with shots are indexable", async () => {
      assert.equal(momentIndexable({ visibility: "PUBLIC", kind: "EVERYDAY", angleCount: 2 }), true);
      assert.equal(momentIndexable({ visibility: "FRIENDS", kind: "EVERYDAY", angleCount: 2 }), false);
      assert.equal(momentIndexable({ visibility: "PUBLIC", kind: "DAILY", angleCount: 2 }), false);
      assert.equal(momentIndexable({ visibility: "PUBLIC", kind: "EVERYDAY", angleCount: 0 }), false);
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
