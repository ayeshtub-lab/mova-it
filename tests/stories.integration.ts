// Integration test for «مع الوقت»: a story is shot by its owner alone, everyone holding it
// sees all of it, it never enters «صوّر معك», and its owner is reminded a week after the
// last shot — a few times at most, starting over with every new shot.
// Run: npx tsx tests/stories.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { AngleError, prepareAngle, publishAngle } from "../src/server/angles";
import { findJoinSuggestion } from "../src/server/join";
import { createMoment, getMomentView } from "../src/server/moments";
import { spread } from "../src/server/montage";
import { MAX_REMINDERS, remindStories } from "../src/server/stories";

const TAG = "[storytest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const DAY = 24 * 3600 * 1000;

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = [await mk("owner"), await mk("other")];
  const ids = [owner.id, other.id];
  const shot = (momentId: string, contributorId: string, uploadedAt: Date) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `storytest/${Math.random()}.jpg`, uploadedAt, capturedAt: uploadedAt } });
  try {
    await check("a story is shot by its owner alone", async () => {
      const story = await createMoment(owner, { title: "نبتة الريحان", kind: "STORY", visibility: "PUBLIC" });
      assert.equal(story.kind, "STORY");
      assert.equal((await createMoment(owner, { title: "x", kind: "WHATEVER" })).kind, "EVERYDAY");
      await assert.rejects(prepareAngle(other, { code: story.code, mediaType: "PHOTO" }), (e) => e instanceof AngleError && e.code === "story_owner");
      const { angleId } = await prepareAngle(owner, { code: story.code, mediaType: "PHOTO" });
      assert.ok(angleId);
    });

    await check("whoever holds a story sees all of it", async () => {
      const story = await createMoment(owner, { title: "بيتنا", kind: "STORY" });
      await shot(story.id, owner.id, new Date(Date.now() - 20 * DAY));
      await shot(story.id, owner.id, new Date(Date.now() - 10 * DAY));
      await shot(story.id, owner.id, new Date());
      const view = (await getMomentView(story.code, other))!;
      assert.equal(view.lockedCount, 0);
      assert.equal(view.angles.length, 3);
      assert.equal(view.kind, "STORY");
    });

    await check("a story never enters «صوّر معك»", async () => {
      const story = await createMoment(owner, { title: "شجرة", kind: "STORY", visibility: "PUBLIC" });
      const a = await db.angle.create({ data: { momentId: story.id, contributorId: owner.id, mediaType: "PHOTO", status: "DRAFT", screening: "allowed", scene: "nature" } });
      assert.equal(await findJoinSuggestion(owner.id, a.id), null);
    });

    await check("the owner is reminded a week after the last shot, a few times at most", async () => {
      const story = await createMoment(owner, { title: "المحل", kind: "STORY" });
      const fresh = await createMoment(owner, { title: "حديقة", kind: "STORY" });
      await shot(story.id, owner.id, new Date(Date.now() - 8 * DAY));
      await shot(fresh.id, owner.id, new Date(Date.now() - 2 * DAY));
      const told = () => db.notification.count({ where: { userId: owner.id, kind: "STORY_REMINDER" } });

      await remindStories();
      assert.equal(await told(), 1, "the week-old story, not the fresh one");
      await remindStories();
      assert.equal(await told(), 1, "not twice in the same week");

      let now = Date.now();
      for (let i = 1; i < MAX_REMINDERS + 2; i++) {
        now += 8 * DAY;
        await remindStories(new Date(now));
      }
      const oldOnes = await db.notification.count({ where: { userId: owner.id, kind: "STORY_REMINDER", angle: { momentId: story.id } } });
      assert.equal(oldOnes, MAX_REMINDERS, "stops after a few");

      // A new shot starts them over.
      const draft = await db.angle.create({ data: { momentId: story.id, contributorId: owner.id, mediaType: "PHOTO", status: "DRAFT", screening: "allowed" } });
      await publishAngle(owner, draft.id);
      const after = await db.moment.findUniqueOrThrow({ where: { id: story.id } });
      assert.equal(after.reminders, 0);
      assert.equal(after.remindedAt, null);
    });

    await check("a long story's video takes shots spread from the first to the latest", async () => {
      const days = Array.from({ length: 100 }, (_, i) => i);
      const picked = spread(days, 40);
      assert.equal(picked.length, 40);
      assert.equal(picked[0], 0);
      assert.equal(picked.at(-1), 99);
      assert.deepEqual(spread([1, 2, 3], 40), [1, 2, 3]);
    });
  } finally {
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
