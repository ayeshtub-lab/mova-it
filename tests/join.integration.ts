// Integration test for «صوّر معك» (src/server/join.ts): who is offered which moment (same
// scene, near enough for that scene, close in time, public, host allows it), joining moves the
// shot and tells the host, «شيلها» gives it back, and Discover's «اليوم حوالينا» cards.
// Run: npx tsx tests/join.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { findJoinSuggestion, giveBack, joinMoment, JoinError } from "../src/server/join";
import { sceneCards } from "../src/server/places";

const TAG = "[jointest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const HOUR = 3600 * 1000;
const code = () => `JT${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const placeId = async (nameAr: string) => (await db.place.findFirstOrThrow({ where: { nameAr, countryCode: "PS", kind: { notIn: ["GOVERNORATE"] } } })).id;

async function main() {
  if ((await db.place.count()) < 1000) throw new Error("the test database has no places: run `npx tsx tools/places/seed.ts --db=test`");
  const mk = (n: string, extra = {}) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, ...extra } });
  const [host, me, other, guest] = [await mk("host"), await mk("me"), await mk("other"), await mk("guest", { isGuest: true })];
  const ids = [host.id, me.id, other.id, guest.id];
  const [bethlehem, artas, ramallah, jenin] = [await placeId("بيت لحم"), await placeId("أرطاس"), await placeId("رام الله"), await placeId("جنين")];
  const now = Date.now();

  const moment = (creatorId: string, visibility: "PUBLIC" | "FRIENDS", title = `${TAG} m`, place: string | null = null) =>
    db.moment.create({ data: { code: code(), title, visibility, creatorId, placeId: place, participants: { create: { userId: creatorId, role: "HOST" } } } });
  const shot = (momentId: string, contributorId: string, scene: string, place: string, at: number) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x.jpg", scene, placeId: place, capturedAt: new Date(at) } });

  try {
    const hostSunset = await moment(host.id, "PUBLIC", `${TAG} غروب`, bethlehem);
    await shot(hostSunset.id, host.id, "sunset", bethlehem, now - HOUR);

    await check("a sunset shot nearby, an hour apart → offered the host's public moment", async () => {
      const mine = await moment(me.id, "FRIENDS");
      const a = await shot(mine.id, me.id, "sunset", artas, now);
      const s = await findJoinSuggestion(me.id, a.id);
      assert.equal(s?.momentCode, hostSunset.code);
      assert.equal(s?.scene, "sunset");
      assert.equal(s?.placeName, "بيت لحم");
      assert.equal(s?.angleCount, 1);
    });

    await check("reach depends on the scene: one sunset is seen 40 km away, a wedding only nearby", async () => {
      const far = await moment(me.id, "FRIENDS");
      assert.equal((await findJoinSuggestion(me.id, (await shot(far.id, me.id, "sunset", ramallah, now)).id))?.momentCode, hostSunset.code, "Ramallah sunset ~20 km");
      assert.equal(await findJoinSuggestion(me.id, (await shot(far.id, me.id, "sunset", jenin, now)).id), null, "Jenin is too far");
      const wedding = await moment(host.id, "PUBLIC", `${TAG} عرس`, bethlehem);
      await shot(wedding.id, host.id, "wedding", bethlehem, now);
      const w = await moment(me.id, "FRIENDS");
      assert.equal((await findJoinSuggestion(me.id, (await shot(w.id, me.id, "wedding", artas, now)).id))?.momentCode, wedding.code, "Artas is next door");
      assert.equal(await findJoinSuggestion(me.id, (await shot(w.id, me.id, "wedding", ramallah, now)).id), null, "another town's wedding");
    });

    await check("never: hours apart, another scene, «other», friends-only, a guest, or a host who turned it off", async () => {
      const m = await moment(me.id, "FRIENDS");
      assert.equal(await findJoinSuggestion(me.id, (await shot(m.id, me.id, "sunset", artas, now - 6 * HOUR)).id), null, "5+ hours apart");
      assert.equal(await findJoinSuggestion(me.id, (await shot(m.id, me.id, "rain", artas, now)).id), null, "another scene");
      assert.equal(await findJoinSuggestion(me.id, (await shot(m.id, me.id, "other", artas, now)).id), null, "«other» says nothing");
      const g = await moment(guest.id, "FRIENDS");
      assert.equal(await findJoinSuggestion(guest.id, (await shot(g.id, guest.id, "sunset", artas, now)).id), null, "guests can't add to public moments");
      const friendsOnly = await moment(other.id, "FRIENDS", `${TAG} خاص`, bethlehem);
      await shot(friendsOnly.id, other.id, "rain", bethlehem, now);
      assert.equal(await findJoinSuggestion(me.id, (await shot(m.id, me.id, "rain", artas, now)).id), null, "a friends-only moment");
      await db.user.update({ where: { id: host.id }, data: { allowJoins: false } });
      assert.equal(await findJoinSuggestion(me.id, (await shot(m.id, me.id, "sunset", artas, now)).id), null, "host said no");
      await db.user.update({ where: { id: host.id }, data: { allowJoins: true } });
    });

    await check("joining: only the moment offered; the shot moves, the empty old moment goes, the host is told", async () => {
      const mine = await moment(me.id, "FRIENDS", `${TAG} غروبي`);
      const a = await shot(mine.id, me.id, "sunset", artas, now);
      const random = await moment(other.id, "PUBLIC");
      await assert.rejects(joinMoment(me.id, a.id, random.code), (e) => e instanceof JoinError && e.code === "not_suggested");
      await assert.rejects(joinMoment(other.id, a.id, hostSunset.code), (e) => e instanceof JoinError, "not your shot");
      assert.deepEqual(await joinMoment(me.id, a.id, hostSunset.code), { code: hostSunset.code });
      const moved = await db.angle.findUniqueOrThrow({ where: { id: a.id } });
      assert.equal(moved.momentId, hostSunset.id);
      assert.equal((moved.joinedFrom as { title: string }).title, `${TAG} غروبي`);
      assert.equal(await db.moment.findUnique({ where: { id: mine.id } }), null, "the empty old moment is gone");
      assert.ok(await db.participant.findUnique({ where: { momentId_userId: { momentId: hostSunset.id, userId: me.id } } }));
      assert.equal(await db.notification.count({ where: { userId: host.id, actorId: me.id, kind: "JOINED", angleId: a.id } }), 1);
      assert.equal(await findJoinSuggestion(me.id, (await shot((await moment(me.id, "FRIENDS")).id, me.id, "sunset", artas, now)).id), null, "not offered a moment you're already in");

      await check("«شيلها»: only the host; the shot gets a moment of its own back, nothing deleted", async () => {
        await assert.rejects(giveBack(me.id, a.id), (e) => e instanceof JoinError && e.code === "forbidden");
        const back = await giveBack(host.id, a.id);
        const home = await db.moment.findUniqueOrThrow({ where: { code: back.code } });
        assert.equal(home.creatorId, me.id);
        assert.equal(home.title, `${TAG} غروبي`);
        assert.equal(home.visibility, "FRIENDS");
        const after = await db.angle.findUniqueOrThrow({ where: { id: a.id } });
        assert.equal(after.momentId, home.id);
        assert.equal(after.joinedFrom, null);
        assert.equal(await db.notification.count({ where: { angleId: a.id, kind: "JOINED" } }), 0);
      });
    });

    await check("Discover's «اليوم حوالينا»: a scene 3+ shots by 2+ people in one place today", async () => {
      const pub = await moment(other.id, "PUBLIC", `${TAG} مطر`, bethlehem);
      await shot(pub.id, other.id, "snow", bethlehem, now);
      await shot(pub.id, other.id, "snow", bethlehem, now);
      assert.ok(!(await sceneCards(null, 50)).some((c) => c.scene === "snow"), "one person isn't a shared moment");
      await shot(pub.id, host.id, "snow", artas, now);
      const card = (await sceneCards(null, 50)).find((c) => c.scene === "snow");
      assert.ok(card, "card shows");
      assert.equal(card.count, 3);
    });
  } finally {
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
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
