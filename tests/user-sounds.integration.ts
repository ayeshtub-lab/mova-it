// Integration test for «🎤 صوتك الأصلي»'s guards (the listening itself needs Gemini, tested by
// hand): only the video's owner, only in a public moment; a people's sound can be put on a shot
// only while it is public.
// Run: npx tsx tests/user-sounds.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { isPeopleKey, soundByKey, soundFile } from "../src/lib/sounds";
import { setAngleSound, SoundError } from "../src/server/sounds";
import { offerSound, UserSoundError } from "../src/server/user-sounds";

const TAG = "[usersoundtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = [await mk("owner"), await mk("other")];
  const ids = [owner.id, other.id];
  let n = 0;
  const moment = (visibility: string) => db.moment.create({ data: { code: `US${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: TAG, creatorId: owner.id, visibility } as never });
  const video = (momentId: string, contributorId = owner.id) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "VIDEO", status: "READY", screening: "allowed", mediaPath: `usersoundtest/${Math.random()}.mp4` } });
  try {
    await check("only the owner, only in a public moment", async () => {
      const friends = await video((await moment("FRIENDS")).id);
      await assert.rejects(offerSound(owner, friends.id), (e) => e instanceof UserSoundError && e.code === "not_public");
      const open = await video((await moment("PUBLIC")).id);
      await assert.rejects(offerSound(other, open.id), (e) => e instanceof UserSoundError && e.code === "not_found");
    });

    await check("a people's sound plays like a library one, but is usable only while public", async () => {
      const key = "u0123456789ab";
      assert.ok(isPeopleKey(key) && soundByKey(key)?.cat === "people");
      assert.equal(soundFile(key), `/sounds/u/${key}.mp3`);
      const m = await moment("PUBLIC");
      const source = await video(m.id);
      const shot = await video(m.id, other.id);
      await db.userSound.create({ data: { key, ownerId: owner.id, angleId: source.id, name: "ضحكة", seconds: 10, status: "blocked", reason: "music" } });
      await assert.rejects(setAngleSound(other, shot.id, key, false), (e) => e instanceof SoundError && e.code === "invalid");
      await db.userSound.update({ where: { key }, data: { status: "public", path: "usersoundtest/x.mp3" } });
      assert.equal((await setAngleSound(other, shot.id, key, false)).soundKey, key);
    });
  } finally {
    await db.userSound.deleteMany({ where: { ownerId: { in: ids } } });
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
