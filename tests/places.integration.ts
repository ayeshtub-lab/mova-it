// Integration test for places: a shot's place comes silently from the photo (or the moment),
// «موثّق» only for a recent photo, place pages show public shots only, counts hide under 20
// people, and only a shot's owner can remove its place.
// Run: npx tsx tests/places.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { prepareAngle } from "../src/server/angles";
import { createMoment } from "../src/server/moments";
import { placePage, searchPlaces, setAnglePlace } from "../src/server/places";

const TAG = "[placetest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const idOf = async (nameAr: string, kind?: string) => (await db.place.findFirstOrThrow({ where: { nameAr, countryCode: "PS", ...(kind ? { kind: kind as never } : {}) } })).id;

async function main() {
  if ((await db.place.count()) < 1000) throw new Error("the test database has no places: run `npx tsx tools/places/seed.ts --db=test`");
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = await Promise.all([mk("owner"), mk("other")]);
  const ids = [owner.id, other.id];
  const [artas, bethlehem, gov] = [await idOf("أرطاس"), await idOf("بيت لحم", "CITY"), await idOf("بيت لحم", "GOVERNORATE")];
  const now = new Date().toISOString();
  try {
    await check("a typed place becomes the standard one; a spot is kept as text", async () => {
      const a = await createMoment(owner, { title: `${TAG} a`, placeName: "ارطاس" });
      assert.equal(a.placeId, artas);
      assert.equal(a.placeName, null);
      const b = await createMoment(owner, { title: `${TAG} b`, placeName: "برك سليمان" });
      assert.equal(b.placeId, null);
      assert.equal(b.placeName, "برك سليمان");
      const c = await createMoment(owner, { title: `${TAG} c`, placeName: "بيت لحم - المدبسة" });
      assert.equal(c.placeId, bethlehem);
      assert.equal(c.placeName, "بيت لحم - المدبسة");
      const d = await createMoment(owner, { title: `${TAG} d`, placeName: "ارطاس", placeId: bethlehem });
      assert.equal(d.placeId, bethlehem, "a picked place wins over the text");
    });

    await check("the photo's place is saved silently, «موثّق» when recent, and the moment takes it", async () => {
      const m = await createMoment(owner, { title: `${TAG} photo` });
      const { angleId } = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", capturedAt: now, placeId: artas }, "PS");
      const a = await db.angle.findUniqueOrThrow({ where: { id: angleId } });
      assert.equal(a.placeId, artas);
      assert.equal(a.placeFrom, "PHOTO");
      assert.equal(a.placeVerified, true);
      assert.equal(a.ipCountryMatch, true);
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).placeId, artas);
    });

    await check("an old photo is not «موثّق»; another country's network doesn't match", async () => {
      const m = await createMoment(owner, { title: `${TAG} old` });
      const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { angleId } = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", capturedAt: old, placeId: artas }, "DE");
      const a = await db.angle.findUniqueOrThrow({ where: { id: angleId } });
      assert.equal(a.placeVerified, false);
      assert.equal(a.ipCountryMatch, false);
    });

    await check("no place from the photo → the moment's; nonsense or a whole country is ignored", async () => {
      const m = await createMoment(owner, { title: `${TAG} inherit`, placeName: "بيت لحم" });
      const one = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", capturedAt: now }, null);
      const two = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", capturedAt: now, placeId: "c-PS" }, null);
      const three = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", capturedAt: now, placeId: "nope'; drop table" }, null);
      for (const { angleId } of [one, two, three]) {
        const a = await db.angle.findUniqueOrThrow({ where: { id: angleId } });
        assert.equal(a.placeId, bethlehem);
        assert.equal(a.placeFrom, "MOMENT");
        assert.equal(a.placeVerified, false);
      }
    });

    await check("place pages: public shots only (also on the governorate's page), no counts under 20 people", async () => {
      const pub = await db.moment.create({ data: { code: `PT${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} public`, visibility: "PUBLIC", creatorId: owner.id } });
      const fr = await db.moment.create({ data: { code: `PT${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} friends`, visibility: "FRIENDS", creatorId: owner.id } });
      const shot = (momentId: string) =>
        db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x.jpg", placeId: artas, placeFrom: "PHOTO", placeVerified: true } });
      const [p, f] = [await shot(pub.id), await shot(fr.id)];
      const artasSlug = (await db.place.findUniqueOrThrow({ where: { id: artas } })).slug;
      const page = (await placePage(artasSlug, null))!;
      assert.ok(page.shots.some((s) => s.id === p.id), "the public shot shows");
      assert.ok(!page.shots.some((s) => s.id === f.id), "the friends-only shot never shows");
      assert.equal(page.people, null, "fewer than 20 people: no count");
      assert.deepEqual(page.trail.map((t) => t.name), ["فلسطين", "محافظة بيت لحم"]);
      const govPage = (await placePage((await db.place.findUniqueOrThrow({ where: { id: gov } })).slug, null))!;
      assert.ok(govPage.shots.some((s) => s.id === p.id), "and on the governorate's page");
      assert.ok(govPage.inside.some((x) => x.name === "أرطاس"), "which lists Artas as a place with shots");
      // Hidden again once it's no longer public.
      await db.moment.update({ where: { id: pub.id }, data: { visibility: "FRIENDS" } });
      assert.ok(!(await placePage(artasSlug, null))!.shots.some((s) => s.id === p.id));
    });

    await check("only the shot's owner removes its place", async () => {
      const m = await createMoment(owner, { title: `${TAG} remove` });
      const { angleId } = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", capturedAt: now, placeId: artas }, "PS");
      assert.equal(await setAnglePlace(other, angleId, null), null);
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: angleId } })).placeId, artas);
      assert.deepEqual(await setAnglePlace(owner, angleId, null), { place: null });
      const a = await db.angle.findUniqueOrThrow({ where: { id: angleId } });
      assert.equal(a.placeId, null);
      assert.equal(a.placeVerified, false);
      assert.equal(await setAnglePlace(owner, angleId, "c-PS"), null, "not a whole country");
    });

    await check("search: every spelling, names told apart by their governorate", async () => {
      assert.equal((await searchPlaces("بيتلحم"))[0].name, "بيت لحم");
      assert.equal((await searchPlaces("ارطاس"))[0].name, "أرطاس");
      assert.equal((await searchPlaces("ارطاس"))[0].context, "محافظة بيت لحم، فلسطين");
      assert.deepEqual(await searchPlaces("ب"), []);
    });
  } finally {
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
