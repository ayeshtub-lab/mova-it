// Integration test for «📸 ضيف صورك» (src/server/sort.ts, 2026-11-26): photos wait in the person's
// holding moment, unseen; Zawmo groups them (own moment of the topic, a new one, a public one for a
// few photos, never public for friends-only), and «نشر الكل» moves and publishes them.
// Run: npx tsx tests/sort.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { AngleError, prepareAngle, publishAngle } from "../src/server/angles";
import { getMomentView } from "../src/server/moments";
import { dropEmptyInbox, inboxFor, publishSorted, sortPlan } from "../src/server/sort";

const TAG = "[sorttest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const code = () => `ST${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [me, host, stranger] = [await mk("me"), await mk("host"), await mk("stranger")];
  const ids = [me.id, host.id, stranger.id];
  const moment = (creatorId: string, title: string, visibility: "PUBLIC" | "FRIENDS" = "PUBLIC") =>
    db.moment.create({ data: { code: code(), title, visibility, creatorId, participants: { create: { userId: creatorId, role: "HOST" } } } });
  const shot = (momentId: string, contributorId: string, aiTitle: string, scene: string, status: "DRAFT" | "READY" | "PROCESSING" = "DRAFT") =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status, screening: "allowed", mediaPath: "x.jpg", aiTitle, scene, aiText: `${aiTitle} #صور_حقيقية` } });

  try {
    // Someone else's public coffee moment (with a shot, as a real one has), and my own garden.
    const coffee = await moment(host.id, "صور حقيقية قهوة الصباح");
    await shot(coffee.id, host.id, "فنجان قهوة", "food", "READY");
    const garden = await moment(me.id, "خضار الحاكورة");

    const inbox = await inboxFor(me);
    await check("one holding moment per person, unseen by anyone and never a page", async () => {
      assert.equal((await inboxFor(me)).id, inbox.id);
      assert.ok(inbox.inbox);
      assert.equal(await getMomentView(inbox.code, me), null);
      assert.equal(await getMomentView(inbox.code, stranger), null);
      await assert.rejects(prepareAngle(stranger, { code: inbox.code, mediaType: "PHOTO", contentType: "image/jpeg" }), (e: unknown) => e instanceof AngleError && e.code === "not_found");
    });

    // 7 flowers, 6 sweets, 2 coffee, 1 cat, 1 makeup — and one still being checked.
    for (let i = 0; i < 7; i++) await shot(inbox.id, me.id, `صور ازهار جميلة ورد ${i}`, "nature");
    for (let i = 0; i < 6; i++) await shot(inbox.id, me.id, `صور حلويات حقيقية كنافة ${i}`, "food");
    const cups = [await shot(inbox.id, me.id, "صور فنجان قهوة حقيقي", "food"), await shot(inbox.id, me.id, "فنجان قهوة بالحليب", "food")];
    await shot(inbox.id, me.id, "قطة مخططة تجلس داخل المنزل", "pets");
    await shot(inbox.id, me.id, "مستحضرات تجميل ومكياج", "other");
    const pending = await shot(inbox.id, me.id, "", "other", "PROCESSING");

    await check("a photo there is never published the usual way", async () => {
      await assert.rejects(publishAngle(me, cups[0].id), (e: unknown) => e instanceof AngleError && e.code === "forbidden");
    });

    await check("still checking: the plan waits for it", async () => {
      assert.equal((await sortPlan(me, "PUBLIC")).waiting, 1);
      await db.angle.delete({ where: { id: pending.id } });
    });

    await check("for everyone: own moment of the topic, a new one, a public one for few, the rest «من يومياتي»", async () => {
      const plan = await sortPlan(me, "PUBLIC");
      const by = new Map(plan.groups.map((g) => [g.topic, g]));
      assert.equal(by.get("plants")?.code, garden.code, "my garden takes the flowers");
      assert.equal(by.get("plants")?.shots.length, 7);
      assert.equal(by.get("sweets")?.kind, "new", "6 sweets: a new moment of mine");
      assert.equal(by.get("coffee")?.code, coffee.code, "2 cups: the public coffee moment");
      assert.equal(by.get("misc")?.kind, "new", "a cat with no public animals moment, and the makeup");
      assert.equal(by.get("misc")?.shots.length, 2);
    });

    await check("friends only: nothing goes to a public moment", async () => {
      const plan = await sortPlan(me, "FRIENDS");
      assert.ok(plan.groups.every((g) => g.kind !== "public"));
      assert.ok(!plan.groups.some((g) => g.code === garden.code), "my garden is public: not for friends-only photos");
    });

    await check("«نشر الكل»: moved, up, named, the removed left out, the holding moment empty", async () => {
      const plan = await sortPlan(me, "PUBLIC");
      const sweets = plan.groups.find((g) => g.topic === "sweets")!;
      const misc = plan.groups.find((g) => g.topic === "misc")!;
      const makeup = misc.shots.find((s) => s.title?.includes("مكياج"))!;
      const cat = misc.shots.find((s) => s.title?.includes("قطة"))!;
      const done = await publishSorted(me, {
        visibility: "PUBLIC",
        assign: { [makeup.id]: "remove", [cat.id]: sweets.key },
        titles: { [sweets.key]: "حلويات بيتنا", [misc.key]: "ما لازم ينعمل" },
      });
      assert.deepEqual(done.removed, [makeup.id]);
      const made = await db.moment.findFirstOrThrow({ where: { creatorId: me.id, title: "حلويات بيتنا" }, include: { angles: true } });
      assert.equal(made.visibility, "PUBLIC");
      assert.equal(made.angles.length, 7, "6 sweets and the cat moved there");
      assert.ok(made.angles.every((a) => a.status === "READY"));
      assert.ok(made.description, "described by its first photo");
      assert.equal(await db.angle.count({ where: { momentId: garden.id, status: "READY" } }), 7);
      const cupsNow = await db.angle.findMany({ where: { id: { in: cups.map((c) => c.id) } } });
      assert.ok(cupsNow.every((c) => c.momentId === coffee.id && c.status === "READY" && c.contributorId === me.id), "on the public moment, under my name");
      assert.ok(await db.participant.findUnique({ where: { momentId_userId: { momentId: coffee.id, userId: me.id } } }));
      assert.equal(await db.moment.count({ where: { creatorId: me.id, title: "ما لازم ينعمل" } }), 0, "an emptied group makes no moment");
      // The removed one is deleted by the page; here, by hand.
      await db.angle.delete({ where: { id: makeup.id } });
      await dropEmptyInbox(done.inboxId);
      assert.equal(await db.moment.count({ where: { id: inbox.id } }), 0);
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(out.join("\n") + `\n\n${out.length} checks passed`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
