// Integration test for «🎬 صار فيك تعمل الفيديو»: when a moment reaches enough shots for its
// video, the owner of its first shot (who makes the video) is told — once, even when two
// shots are published together; not after a video was made; not for «لحظة اليوم»; and a
// «مع الوقت» story from its own (smaller) minimum.
// Run: npx tsx tests/video-offer.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createMoment } from "../src/server/moments";
import { MIN_ANGLES, offerVideo, STORY_MIN } from "../src/server/montage";

const TAG = "[videooffertest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, first, other] = [await mk("owner"), await mk("first"), await mk("other")];
  const ids = [owner.id, first.id, other.id];
  let t = Date.now() - 3600_000;
  const shot = (momentId: string, contributorId: string) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `videooffertest/${Math.random()}.jpg`, uploadedAt: new Date((t += 1000)) } });
  const told = (userId: string, momentId: string) => db.notification.count({ where: { userId, kind: "VIDEO_READY", angle: { momentId } } });
  try {
    await check("the first shot's owner is told when the moment reaches enough shots — not before", async () => {
      const moment = await createMoment(owner, { title: `${TAG} عرس`, kind: "EVERYDAY" });
      const opening = await shot(moment.id, first.id);
      let last = opening;
      for (let i = 1; i < MIN_ANGLES - 1; i++) last = await shot(moment.id, other.id);
      await offerVideo(last.id);
      assert.equal(await told(first.id, moment.id), 0, `${MIN_ANGLES - 1} shots: not yet`);
      last = await shot(moment.id, other.id);
      await offerVideo(last.id);
      assert.equal(await told(first.id, moment.id), 1, `${MIN_ANGLES} shots: told`);
      assert.equal(await told(owner.id, moment.id), 0, "the creator did not shoot first");
      const n = await db.notification.findFirstOrThrow({ where: { userId: first.id, kind: "VIDEO_READY" } });
      assert.equal(n.angleId, opening.id, "points at the moment through its first shot");
    });

    await check("told once, even when shots are published together", async () => {
      const moment = await createMoment(owner, { title: `${TAG} تخرج`, kind: "EVERYDAY" });
      for (let i = 0; i < MIN_ANGLES - 1; i++) await shot(moment.id, owner.id);
      const [a, b] = [await shot(moment.id, other.id), await shot(moment.id, other.id)];
      await Promise.all([offerVideo(a.id), offerVideo(b.id), offerVideo(b.id)]);
      assert.equal(await told(owner.id, moment.id), 1);
      await offerVideo((await shot(moment.id, other.id)).id);
      assert.equal(await told(owner.id, moment.id), 1, "not again with more shots");
    });

    await check("not once a video was made", async () => {
      const moment = await createMoment(owner, { title: `${TAG} رحلة`, kind: "EVERYDAY" });
      const shots = [];
      for (let i = 0; i < MIN_ANGLES; i++) shots.push(await shot(moment.id, owner.id));
      await db.montage.create({ data: { momentId: moment.id, angleIds: shots.map((s) => s.id), signature: "test", status: "READY" } });
      await offerVideo((await shot(moment.id, other.id)).id);
      assert.equal(await told(owner.id, moment.id), 0);
    });

    await check("never for «لحظة اليوم»", async () => {
      const daily = await db.moment.create({ data: { code: `VO${Date.now().toString(36).slice(-5).toUpperCase()}`, title: `${TAG} daily`, creatorId: owner.id, kind: "DAILY", visibility: "PUBLIC" } });
      let last;
      for (let i = 0; i < MIN_ANGLES + 1; i++) last = await shot(daily.id, owner.id);
      await offerVideo(last!.id);
      assert.equal(await told(owner.id, daily.id), 0);
    });

    await check("a «مع الوقت» story from its own minimum", async () => {
      const story = await createMoment(owner, { title: `${TAG} نبتة`, kind: "STORY" });
      let last;
      for (let i = 0; i < STORY_MIN; i++) last = await shot(story.id, owner.id);
      await offerVideo(last!.id);
      assert.equal(await told(owner.id, story.id), 1);
    });
  } finally {
    const moments = await db.moment.findMany({ where: { creatorId: { in: ids } }, select: { id: true } });
    await db.montage.deleteMany({ where: { momentId: { in: moments.map((m) => m.id) } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
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
