// Integration test for «نشر»: a checked shot is a draft only its owner sees until published;
// joining another moment publishes it there; unpublished drafts and empty new moments are
// cleaned up after a day; the creator edits the moment's title and description.
// Run: npx tsx tests/publish.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { AngleError, publishAngle, purgeStaleUploads } from "../src/server/angles";
import { createMoment, getMomentView, listMyMoments, MomentError, updateMomentDetails } from "../src/server/moments";

const TAG = "[pubtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const DAY = 24 * 3600 * 1000;
const code = () => `PB${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = [await mk("owner"), await mk("other")];
  const ids = [owner.id, other.id];
  const moment = (createdAt = new Date()) =>
    db.moment.create({ data: { code: code(), title: "شاي العصر", visibility: "FRIENDS", creatorId: owner.id, createdAt, participants: { create: { userId: owner.id, role: "HOST" } } } });
  const draft = (momentId: string, uploadedAt = new Date()) =>
    db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "PHOTO", status: "DRAFT", screening: "allowed", mediaPath: `pubtest/${Math.random()}.jpg`, uploadedAt } });
  try {
    await check("a draft shows to nobody until «نشر»; only its owner publishes it", async () => {
      const m = await moment();
      const a = await draft(m.id);
      assert.equal((await getMomentView(m.code, owner))!.angleCount, 0, "a draft is not in the moment yet");
      await assert.rejects(publishAngle(other, a.id), (e) => e instanceof AngleError && e.code === "not_found");
      assert.equal((await publishAngle(owner, a.id)).status, "READY");
      assert.equal((await getMomentView(m.code, owner))!.angleCount, 1);
      assert.equal((await publishAngle(owner, a.id)).status, "READY", "a retry is fine");
    });

    await check("a moment never published doesn't show in «لحظاتي»", async () => {
      const m = await moment();
      await draft(m.id);
      const mine = await listMyMoments(owner);
      assert.ok(!mine.some((x) => x.code === m.code));
    });

    await check("the hourly clean-up: old drafts and empty moments go; published and fresh ones stay", async () => {
      const old = await moment(new Date(Date.now() - 2 * DAY));
      const oldDraft = await draft(old.id, new Date(Date.now() - 2 * DAY));
      const kept = await moment(new Date(Date.now() - 2 * DAY));
      const keptShot = await draft(kept.id, new Date(Date.now() - 2 * DAY));
      await publishAngle(owner, keptShot.id);
      const fresh = await moment();
      const freshDraft = await draft(fresh.id);
      const oldEmptyBefore = await db.moment.create({ data: { code: code(), title: "قديمة", creatorId: owner.id, createdAt: new Date(Date.now() - 10 * DAY) } });

      // As if «نشر» had existed for a week (the real start date leaves older moments alone).
      await purgeStaleUploads(new Date(), new Date(Date.now() - 7 * DAY));
      assert.equal(await db.angle.findUnique({ where: { id: oldDraft.id } }), null, "a day-old draft is gone");
      assert.equal(await db.moment.findUnique({ where: { id: old.id } }), null, "and its now-empty moment");
      assert.ok(await db.angle.findUnique({ where: { id: keptShot.id } }), "a published shot stays");
      assert.ok(await db.angle.findUnique({ where: { id: freshDraft.id } }), "a fresh draft stays");
      assert.ok(await db.moment.findUnique({ where: { id: fresh.id } }), "a fresh moment stays");
      assert.ok(await db.moment.findUnique({ where: { id: oldEmptyBefore.id } }), "empty moments from before «نشر» are left alone");
    });

    await check("«تعديل»: only the creator changes the title and description", async () => {
      const m = await moment();
      await assert.rejects(updateMomentDetails(other, m.code, { title: "لا" }), (e) => e instanceof MomentError && e.code === "forbidden");
      await assert.rejects(updateMomentDetails(owner, m.code, { title: "   " }), (e) => e instanceof MomentError && e.code === "invalid_title");
      const done = await updateMomentDetails(owner, m.code, { title: " شاي  المغرب ", description: "مع الجيران" });
      assert.equal(done.title, "شاي المغرب");
      assert.equal(done.description, "مع الجيران");
      assert.equal((await updateMomentDetails(owner, m.code, { title: "شاي", description: "" })).description, null);
    });
    await check("a moment may start without a name; its creator names it at the first «نشر»", async () => {
      await assert.rejects(createMoment(owner, { title: "" }), (e) => e instanceof MomentError && e.code === "invalid_title");
      const m = await createMoment(owner, { title: "  ", untitled: "لحظة جديدة" });
      assert.equal(m.title, "لحظة جديدة");
      assert.equal(m.named, false);
      assert.equal((await createMoment(owner, { title: "غروب", untitled: "لحظة جديدة" })).named, true);
      const a = await draft(m.id);
      await assert.rejects(publishAngle(owner, a.id), (e) => e instanceof AngleError && e.code === "needs_title");
      await assert.rejects(publishAngle(owner, a.id, "   "), (e) => e instanceof AngleError && e.code === "needs_title");
      await publishAngle(owner, a.id, "  عنب   الدالية ");
      const after = await db.moment.findUniqueOrThrow({ where: { id: m.id } });
      assert.equal(after.title, "عنب الدالية");
      assert.equal(after.named, true);
      const b = await draft(m.id);
      await publishAngle(owner, b.id, "اسم آخر");
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).title, "عنب الدالية", "a later «نشر» keeps the name");
    });

    await check("someone else's shot in an unnamed moment goes up without naming it", async () => {
      const m = await createMoment(owner, { title: "", untitled: "لحظة جديدة" });
      const theirs = await db.angle.create({ data: { momentId: m.id, contributorId: other.id, mediaType: "PHOTO", status: "DRAFT", screening: "allowed", mediaPath: `pubtest/${Math.random()}.jpg` } });
      assert.equal((await publishAngle(other, theirs.id)).status, "READY");
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).named, false);
    });

    await check("«تعديل» names a moment too", async () => {
      const m = await createMoment(owner, { title: "", untitled: "لحظة جديدة" });
      await updateMomentDetails(owner, m.code, { title: "عشاء العيلة" });
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).named, true);
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
