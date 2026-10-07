// Integration test for event pages (src/server/events.ts): a day's rain in one area becomes a
// page once 3 public shots by 2 people show it (by scene, or an outdoor shot by its weather);
// fewer, or friends-only, or a plate of food on a rainy day: no page. A town's shots count for
// its governorate. Uses a day in 2099 so real shots never mix in.
// Run: npx tsx tests/events.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { eventPage, eventPath, findEvents, phenomenonOf } from "../src/server/events";

const TAG = "[eventtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const DAY = "2099-01-15";
const at = (hour: number) => new Date(Date.UTC(2099, 0, 15, hour - 3)); // Mecca hour on DAY

async function main() {
  await check("a shot's phenomenon: its scene, or an outdoor shot's weather", async () => {
    assert.equal(phenomenonOf("rain", null), "rain");
    assert.equal(phenomenonOf("street", "heavyrain"), "rain");
    assert.equal(phenomenonOf("nature", "lightsnow"), "snow");
    assert.equal(phenomenonOf("food", "rain"), null, "food on a rainy day is not a rain shot");
    assert.equal(phenomenonOf("street", "cloudy"), null);
  });

  const [a, b, c] = await Promise.all(["a", "b", "c"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } })));
  const ids = [a.id, b.id, c.id];
  try {
    // A town inside a governorate (from the test database's place tree).
    const town = await db.place.findFirst({ where: { kind: { in: ["CITY", "TOWN"] }, parent: { kind: "GOVERNORATE" } }, select: { id: true, parentId: true } });
    assert.ok(town?.parentId, "the test database has a town in a governorate");
    const gov = await db.place.findUniqueOrThrow({ where: { id: town.parentId }, select: { id: true, slug: true } });
    let n = 0;
    const moment = (creatorId: string, visibility = "PUBLIC") =>
      db.moment.create({ data: { code: `EV${Date.now().toString(36).slice(-3).toUpperCase()}${n++}`, title: `${TAG} m`, creatorId, visibility } as never });
    const shot = (momentId: string, contributorId: string, hour: number, scene: string | null, weather: string | null = null) =>
      db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `eventtest/${Math.random()}.jpg`, placeId: town.id, capturedAt: at(hour), uploadedAt: at(hour), scene, weather } as never });
    const ma = await moment(a.id);
    const mb = await moment(b.id);
    const hidden = await moment(c.id, "FRIENDS");

    await check("2 shots by one person: no page yet", async () => {
      await shot(ma.id, a.id, 7, "rain");
      await shot(ma.id, a.id, 8, "street", "rain");
      await shot(hidden.id, c.id, 9, "rain"); // friends-only: never counts
      await shot(mb.id, b.id, 9, "food", "rain"); // food: not a rain shot
      assert.equal(await eventPage(gov.slug, "rain", DAY), null);
    });

    await check("a third shot by another person: the governorate's rain page, in time order", async () => {
      await shot(mb.id, b.id, 10, "nature", "heavyrain");
      const page = await eventPage(gov.slug, "rain", DAY);
      assert.ok(page, "a page");
      assert.equal(page.shots.length, 3);
      assert.equal(page.people, 2);
      assert.deepEqual(page.shots.map((s) => s.at.getTime()), [at(7), at(8), at(10)].map((d) => d.getTime()));
      assert.ok(page.shots.every((s) => s.imageUrl.startsWith("/i/")), "lasting picture addresses");
      assert.equal(await eventPage(gov.slug, "snow", DAY), null, "not a snow day");
      assert.equal(await eventPage(gov.slug, "rain", "2099-01-16"), null, "nor the next day");
      assert.equal(await eventPage(gov.slug, "bogus", DAY), null);
    });

    await check("listed for the sitemap and the place page", async () => {
      const since = new Date(Date.UTC(2099, 0, 1));
      const list = await findEvents({ since, areaId: gov.id });
      const e = list.find((x) => x.day === DAY && x.scene === "rain");
      assert.ok(e, "listed");
      assert.equal(e.shots, 3);
      assert.equal(eventPath(e), `/e/${encodeURIComponent(gov.slug)}/rain/${DAY}`);
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
