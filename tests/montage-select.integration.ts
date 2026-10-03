// Integration test for which shots a moment's video uses and when it is remade: every shot,
// near-duplicates aside; past the cap the best (one per person first, picks first); every
// film within 40 seconds; and after the first video, a new version waits for 3 new shots or
// for things to go quiet.
// Run: npx tsx tests/montage-select.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { bestShots, failingLately, waitForMore } from "../src/server/montage";
import { filmLimit, shotTimes } from "../src/server/montage/render";

const TAG = "[montageselecttest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const T0 = new Date("2026-09-30T18:00:00Z").getTime();
const shot = (id: string, contributorId: string, sec: number, extra: Partial<{ mediaType: string; pickedAt: Date | null }> = {}) => ({
  id,
  contributorId,
  mediaType: "PHOTO",
  capturedAt: new Date(T0 + sec * 1000),
  uploadedAt: new Date(T0 + sec * 1000),
  pickedAt: null as Date | null,
  ...extra,
});

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  try {
    await check("near-duplicates (same person, seconds apart) become one; other people's stay", async () => {
      const shots = [shot("a", "salma", 0), shot("b", "salma", 8), shot("c", "omar", 5), shot("d", "salma", 300)];
      assert.deepEqual((await bestShots(shots, 48)).map((s) => s.id), ["a", "c", "d"]);
    });
    await check("of two near-duplicates, the picked one stays", async () => {
      const shots = [shot("a", "salma", 0), shot("b", "salma", 8, { pickedAt: new Date() })];
      assert.deepEqual((await bestShots(shots, 48)).map((s) => s.id), ["b"]);
    });
    await check("photos without a camera time (old prints, WhatsApp: file dates) saved together all stay", async () => {
      const shots = [0, 2, 4, 6].map((sec, i) => ({ ...shot(`p${i}`, "salma", sec), capturedAt: new Date(T0 + sec * 1000 + 137) }));
      assert.equal((await bestShots(shots, 48)).length, 4);
      const none = [0, 2].map((sec, i) => ({ ...shot(`n${i}`, "salma", sec), capturedAt: null }));
      assert.equal((await bestShots(none, 48)).length, 2);
    });
    await check("a photo and a video taken together are not duplicates", async () => {
      const shots = [shot("a", "salma", 0), shot("b", "salma", 5, { mediaType: "VIDEO" })];
      assert.equal((await bestShots(shots, 48)).length, 2);
    });
    await check("past the cap: one per person first, a pick always in, time order kept", async () => {
      const shots = [
        ...Array.from({ length: 6 }, (_, i) => shot(`s${i}`, "salma", i * 60)),
        shot("o1", "omar", 30),
        shot("p1", "salma", 400, { pickedAt: new Date() }),
      ];
      const ids = (await bestShots(shots, 3)).map((s) => s.id);
      assert.equal(ids.length, 3);
      assert.ok(ids.includes("o1"), "Omar has a shot");
      assert.ok(ids.includes("p1"), "the pick is in");
      const order = ids.map((id) => shots.findIndex((s) => s.id === id));
      assert.deepEqual(order, [...order].sort((x, y) => x - y), "in the order they were taken");
    });
    await check("every film stays within 40 seconds", async () => {
      for (const [p, v, story] of [[5, 0, false], [20, 0, false], [30, 5, false], [40, 8, false], [40, 0, true]] as const) {
        const t = shotTimes(p, v, story);
        const transition = story ? 0.25 : 0.45;
        const total = 1.8 + 2.6 + p * t.photo + v * t.video - transition * (p + v + 1);
        assert.ok(total <= 40.05, `${p}+${v}: ${total.toFixed(1)} s`);
      }
      assert.equal(shotTimes(5, 0, false).photo, 2.8, "few shots keep their full time");
      // Under Ayat al-Kursi (54 s), never cut: twelve photos spread over the verse, up to twice as long each.
      const limit = filmLimit("q16");
      assert.ok(limit > 54 && limit < 56);
      const q = shotTimes(12, 0, false, limit);
      const qTotal = 4.4 + 12 * q.photo - 0.45 * 13;
      assert.ok(qTotal > limit - 1 && qTotal <= limit + 0.05, `fills the verse: ${qTotal.toFixed(1)} s`);
      assert.equal(filmLimit("d01"), 40, "any other sound: 40 seconds");
      // 48 videos can't all fit: only as many as a 40-second film holds are kept.
      const videos = Array.from({ length: 48 }, (_, i) => shot(`v${i}`, `p${i % 6}`, i * 60, { mediaType: "VIDEO" }));
      const kept = await bestShots(videos, 48);
      assert.ok(kept.length < 48 && kept.length > 10, `${kept.length} videos kept`);
      const t = shotTimes(0, kept.length, false);
      assert.ok(4.4 + kept.length * t.video - 0.45 * (kept.length + 1) <= 40.05);
      assert.equal(new Set(kept.map((s) => s.contributorId)).size, 6, "everyone still has a shot");
    });

    await check("after the first video: waits for 3 new shots, or for 30 quiet minutes", async () => {
      const moment = await db.moment.create({ data: { code: `MS${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: owner.id, visibility: "FRIENDS" } });
      const add = (minutesAgo: number) =>
        db.angle.create({ data: { momentId: moment.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `montageselecttest/${Math.random()}.jpg`, uploadedAt: new Date(Date.now() - minutesAgo * 60_000), capturedAt: new Date(Date.now() - minutesAgo * 60_000 - Math.random() * 3_600_000) } });
      const first = [];
      for (let i = 0; i < 5; i++) first.push(await add(120 + i * 5));
      await db.montage.create({ data: { momentId: moment.id, angleIds: first.map((a) => a.id), signature: "test", status: "READY" } });
      assert.equal(await waitForMore(moment.id), false, "nothing new");
      await add(1);
      assert.equal(await waitForMore(moment.id), true, "one new shot, just now: wait");
      await add(1);
      await add(1);
      assert.equal(await waitForMore(moment.id), false, "three new shots: remake");
      assert.equal(await waitForMore(moment.id, new Date(Date.now() + 31 * 60_000)), false, "and once quiet, always");
    });

    await check("a film that keeps failing (or gets cut off mid-render) is not retried every quarter hour", async () => {
      const moment = await db.moment.create({ data: { code: `MF${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} f`, creatorId: owner.id, visibility: "FRIENDS" } });
      const attempt = (status: "FAILED" | "RENDERING", minutesAgo: number) =>
        db.montage.create({ data: { momentId: moment.id, angleIds: [], signature: "test", status, createdAt: new Date(Date.now() - minutesAgo * 60_000) } });
      const now = new Date();
      assert.equal(await failingLately(moment.id, now), false, "never tried");
      await attempt("RENDERING", 3);
      assert.equal(await failingLately(moment.id, now), false, "still rendering: not a failure yet");
      await db.montage.deleteMany({ where: { momentId: moment.id } });
      await attempt("RENDERING", 20);
      assert.equal(await failingLately(moment.id, now), true, "cut off 20 minutes ago: waits");
      assert.equal(await failingLately(moment.id, new Date(now.getTime() + 6 * 3600_000)), false, "6 hours later: one more try");
      await attempt("FAILED", 300);
      await attempt("RENDERING", 600);
      assert.equal(await failingLately(moment.id, new Date(now.getTime() + 6 * 3600_000)), true, "3 failures in a day: a day off");
    });
  } finally {
    const moments = await db.moment.findMany({ where: { creatorId: owner.id }, select: { id: true } });
    await db.montage.deleteMany({ where: { momentId: { in: moments.map((m) => m.id) } } });
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
