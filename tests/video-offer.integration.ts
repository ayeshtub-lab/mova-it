// Integration test for «🎬 صار فيك تعمل الفيديو»: since films come by themselves in parts
// (2026-10-15) a moment's shot owner is no longer offered the button; a «مع الوقت» story's owner
// still is, from its own (smaller) minimum — never for «لحظة اليوم».
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
    await check("a moment's film comes by itself in parts (src/server/montage/parts.ts): nobody is offered the button", async () => {
      const moment = await createMoment(owner, { title: `${TAG} عرس`, kind: "EVERYDAY" });
      let last = await shot(moment.id, first.id);
      for (let i = 1; i < MIN_ANGLES + 1; i++) last = await shot(moment.id, other.id);
      await offerVideo(last.id);
      assert.equal(await told(first.id, moment.id), 0);
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
