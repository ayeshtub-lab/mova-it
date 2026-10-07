// Integration test for what a first-time visitor sees: a public moment's video without adding
// a shot (a friends' moment stays locked); the showcase never filled by one moment or one
// title; «اكتشف» led by today's «لحظة اليوم» only, a repeated question shown once.
// Run: npx tsx tests/visitor.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { listDiscover, listTag, publicShowcase } from "../src/server/discover";
import { latestMontageFor } from "../src/server/montage";
import { dailyShots } from "../src/server/daily-video";

const TAG = "[visittest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const person = await db.user.create({ data: { displayName: `${TAG} person`, isGuest: false } });
  const ids = [person.id];
  let n = 0;
  const moment = (data: Record<string, unknown>) =>
    db.moment.create({ data: { code: `VT${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: `${TAG} m${n}`, creatorId: person.id, visibility: "PUBLIC", ...data } as never });
  const shots = (momentId: string, count: number, at = Date.now()) =>
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        db.angle.create({ data: { momentId, contributorId: person.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `visittest/${Math.random()}.jpg`, uploadedAt: new Date(at - i * 1000) } }),
      ),
    );
  try {
    const open = await moment({});
    await shots(open.id, 6);
    const friends = await moment({ visibility: "FRIENDS" });
    await shots(friends.id, 6);
    for (const m of [open, friends]) {
      await db.montage.create({ data: { momentId: m.id, angleIds: [], status: "READY", videoUrl: "visittest/v.mp4", signature: "x" } });
    }

    await check("a visitor sees a public moment's video; a friends' moment stays locked", async () => {
      assert.ok(await latestMontageFor(null, open.code), "public: shown");
      assert.equal(await latestMontageFor(null, friends.code), null, "friends: locked");
      assert.equal((await latestMontageFor(null, open.code))?.canMake, false, "a visitor cannot remake it");
    });

    await check("the showcase shows at most two shots of one moment, and of one title", async () => {
      const same = [await moment({ title: `${TAG} قهوة` }), await moment({ title: `${TAG} قهوة` })];
      for (const m of same) await shots(m.id, 2, Date.now() + 5000);
      const grid = await publicShowcase(12);
      assert.ok(grid.filter((s) => s.momentCode === open.code).length <= 2);
      assert.ok(grid.filter((s) => s.title === `${TAG} قهوة`).length <= 2);
    });

    await check("«اكتشف»: only today's «لحظة اليوم» leads; a question asked again shows once", async () => {
      const day = 24 * 3600 * 1000;
      const old = await moment({ kind: "DAILY", title: `${TAG} شباكك`, createdAt: new Date(Date.now() - 3 * day) });
      const again = await moment({ kind: "DAILY", title: `${TAG} شباكك`, createdAt: new Date(Date.now() - day) });
      const today = await moment({ kind: "DAILY", title: `${TAG} قهوتك`, createdAt: new Date() });
      for (const m of [old, again, today]) await shots(m.id, 1);
      const feed = await listDiscover(null);
      const codes = feed.map((m) => m.code);
      // Other tests share this database and may add a «لحظة اليوم» of their own at the same time:
      // what leads is the newest one there was, and of this test's three, today's.
      const newest = await db.moment.findFirst({ where: { kind: "DAILY", code: { in: codes } }, orderBy: { createdAt: "desc" }, select: { code: true } });
      assert.equal(codes[0], newest?.code, "the newest «لحظة اليوم» leads");
      assert.equal(codes.filter((c) => [old.code, again.code, today.code].includes(c))[0], today.code, "today leads");
      assert.ok(codes.includes(again.code), "the newest of a repeated question stays");
      assert.ok(!codes.includes(old.code), "the older one is dropped");
    });
    await check("the daily film: public, checked shots of members who allow it — never the others", async () => {
      const shy = await db.user.create({ data: { displayName: `${TAG} shy`, isGuest: false, dailyVideo: false } });
      const guest = await db.user.create({ data: { displayName: `${TAG} guest`, isGuest: true } });
      ids.push(shy.id, guest.id);
      const day = await moment({ kind: "DAILY", title: `${TAG} قمر` });
      const mk = (contributorId: string, extra: Record<string, unknown> = {}) =>
        db.angle.create({ data: { momentId: day.id, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `visittest/${Math.random()}.jpg`, capturedAt: new Date(Date.now() - Math.random() * 1e8), ...extra } as never });
      const ok = await mk(person.id);
      await mk(shy.id);
      await mk(guest.id);
      await mk(person.id, { screening: "blocked" });
      await mk(person.id, { status: "HIDDEN" });
      assert.deepEqual((await dailyShots(day.id)).map((a) => a.id), [ok.id]);
    });
    await check("a hashtag page opens for visitors, and finds tags in a shot's line too", async () => {
      const m = await moment({ description: "عشاء #زيتون_تست" });
      const n2 = await moment({});
      await shots(m.id, 1);
      const [s2] = await shots(n2.id, 1);
      await db.angle.update({ where: { id: s2.id }, data: { aiText: "صحن زيتون أخضر #زيتون_تست #مطبخ" } });
      const codes = (await listTag(null, "زيتون_تست")).map((x) => x.code).sort();
      assert.deepEqual(codes, [m.code, n2.code].sort());
      assert.deepEqual(await listTag(null, "زيتون"), [], "exact tags only");
    });
  } finally {
    await db.montage.deleteMany({ where: { moment: { creatorId: { in: ids } } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
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
