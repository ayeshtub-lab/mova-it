// Integration test for official (verified) Zawmo accounts: only they may be called «زاومو»,
// their comments lead the list, their hearts get their own words, and the badge reaches the
// moment page, the comments and «الوارد».
// Run: npx tsx tests/verified.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { addComment, listComments } from "../src/server/comments";
import { createMoment, getMomentView } from "../src/server/moments";
import { listNotifications } from "../src/server/notifications";
import { ProfileError, setDisplayName } from "../src/server/profile";
import { pushMessage } from "../src/server/push";
import { setReaction } from "../src/server/reactions";

const TAG = "[verifiedtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const official = await db.user.create({ data: { displayName: `${TAG} official`, isGuest: false, verified: true } });
  const person = await db.user.create({ data: { displayName: `${TAG} person`, isGuest: false } });
  const ids = [official.id, person.id];
  try {
    await check("only a verified account may be called «زاومو»", async () => {
      for (const name of ["زاومو", "Zawmo Official", "ز ا و م و"]) {
        await assert.rejects(setDisplayName(person, name), (e) => e instanceof ProfileError, name);
      }
      await setDisplayName(person, `${TAG} سلمى`);
      await setDisplayName(official, "زاومو");
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: official.id } })).displayName, "زاومو");
      await db.user.update({ where: { id: official.id }, data: { displayName: `${TAG} official` } });
    });

    const moment = await createMoment(person, { title: `${TAG} m`, kind: "EVERYDAY", visibility: "PUBLIC" });
    const shot = await db.angle.create({ data: { momentId: moment.id, contributorId: person.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `verifiedtest/${Math.random()}.jpg` } });
    const officialShot = await db.angle.create({ data: { momentId: moment.id, contributorId: official.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `verifiedtest/${Math.random()}.jpg` } });

    await check("the badge reaches the moment page", async () => {
      const view = (await getMomentView(moment.code, person))!;
      assert.equal(view.angles.find((a) => a.id === officialShot.id)?.contributorVerified, true);
      assert.equal(view.angles.find((a) => a.id === shot.id)?.contributorVerified, false);
    });

    await check("Zawmo's comment leads, even when it came later", async () => {
      await addComment(person, shot.id, "أول تعليق");
      await addComment(official, shot.id, "لقطة حلوة 👏");
      const list = await listComments(person, shot.id);
      assert.equal(list[0].authorVerified, true);
      assert.equal(list[1].authorVerified, false);
    });

    await check("a heart from Zawmo has its own words", async () => {
      await setReaction(official, shot.id, true);
      const n = (await listNotifications(person)).find((x) => x.kind === "LIKE");
      assert.equal(n?.actorVerified, true);
      assert.match(pushMessage({ kind: "LIKE", actorName: "زاومو", actorVerified: true, momentTitle: "m", comment: null, url: "/" }, "ar").title, /⭐ زاومو/);
      assert.doesNotMatch(pushMessage({ kind: "LIKE", actorName: "سلمى", momentTitle: "m", comment: null, url: "/" }, "ar").title, /⭐ زاومو/);
    });
  } finally {
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
    await db.reaction.deleteMany({ where: { userId: { in: ids } } });
    await db.comment.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = await db.user.count({ where: { displayName: { contains: TAG } } });
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
