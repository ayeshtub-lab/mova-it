// Integration test for «🎬 فيلم اللحظة تحت الأضواء» (2026-11-13): a moment's film may be put in the
// spotlight with points like a shot (picked as «film:<id>»), only by the moment's owner, only a made film
// of a public moment; it runs (livePins), it can share one purchase with shots, and when its moment
// goes private it closes and what wasn't shown comes back.
// Run: npx tsx tests/film-pins.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { FILM_PREFIX, PinError, closePins, livePins, myFilms, spotlightWithPoints } from "../src/server/points";

const TAG = "[filmpintest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  out.push(`PASS ${name}`);
};
const pinErr = (code: string) => (e: unknown) => e instanceof PinError && e.code === code;

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = await Promise.all([mk("owner"), mk("other")]);
  const ids = [owner.id, other.id];
  try {
    const moment = await db.moment.create({ data: { code: `FP${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} حلويات`, creatorId: owner.id, visibility: "PUBLIC", status: "ACTIVE" } });
    const shot = await db.angle.create({ data: { momentId: moment.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x/fp.jpg", smallPath: "x/fp.jpg" } });
    const film = await db.montage.create({ data: { momentId: moment.id, status: "READY", angleIds: [shot.id], part: 1, title: "فيلم الحلويات", videoUrl: "https://example.com/f.mp4" } });
    const unmade = await db.montage.create({ data: { momentId: moment.id, status: "RENDERING", angleIds: [shot.id], part: 2 } });
    await db.pointEntry.create({ data: { userId: owner.id, kind: "gift", points: 1000, ref: `${TAG}-gift` } });

    await check("only the owner's made films of public moments are offered and accepted", async () => {
      assert.deepEqual((await myFilms(owner.id)).map((f) => f.id), [film.id]);
      assert.deepEqual(await myFilms(other.id), []);
      await assert.rejects(spotlightWithPoints(other, [`${FILM_PREFIX}${film.id}`], 100), pinErr("not_found"));
      await assert.rejects(spotlightWithPoints(owner, [`${FILM_PREFIX}${unmade.id}`], 100), pinErr("not_public"));
      await assert.rejects(spotlightWithPoints(owner, [`${FILM_PREFIX}nope`], 100), pinErr("not_found"));
    });

    await check("a film and a shot in one purchase: split, the film's pin has no shot", async () => {
      await spotlightWithPoints(owner, [`${FILM_PREFIX}${film.id}`, shot.id], 300);
      const pins = await db.homePin.findMany({ where: { userId: owner.id }, orderBy: { budget: "desc" } });
      assert.equal(pins.length, 2);
      const filmPin = pins.find((p) => p.filmId)!;
      assert.equal(filmPin.filmId, film.id);
      assert.equal(filmPin.angleId, null);
      assert.equal(filmPin.budget + pins.find((p) => p.angleId)!.budget, 300);
      const live = await livePins();
      const mine = live.find((p) => p.id === filmPin.id);
      assert.ok(mine?.film && mine.film.moment.code === moment.code && !mine.angle, "the film runs");
    });

    await check("the moment made private: the film's pin closes and its points come back", async () => {
      await db.moment.update({ where: { id: moment.id }, data: { visibility: "FRIENDS" } });
      await closePins();
      const filmPin = await db.homePin.findFirst({ where: { userId: owner.id, filmId: film.id } });
      assert.ok(filmPin?.closedAt, "closed");
      const back = await db.pointEntry.findFirst({ where: { userId: owner.id, kind: "refund", ref: filmPin!.id } });
      assert.equal(back?.points, filmPin!.budget);
      assert.ok(!(await livePins()).some((p) => p.id === filmPin!.id));
    });
  } finally {
    await db.pointEntry.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
    await db.homePin.deleteMany({ where: { userId: { in: ids } } });
    await db.montage.deleteMany({ where: { moment: { creatorId: { in: ids } } } });
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
