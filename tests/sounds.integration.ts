// Integration test for the sound library (src/server/sounds.ts, montage requests).
// Run: npx tsx tests/sounds.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createMoment, getMomentView } from "../src/server/moments";
import { requestMontage } from "../src/server/montage";
import { setAngleSound, SoundError, soundShots, soundUses } from "../src/server/sounds";

const TAG = "[soundtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = await Promise.all([mk("owner"), mk("other")]);
  const ids = [owner.id, other.id];
  try {
    const m = await createMoment(owner, { title: `${TAG} m`, visibility: "FRIENDS" });
    const mkAngle = (mediaType: "PHOTO" | "VIDEO") =>
      db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType, status: "READY", screening: "allowed", mediaPath: "x" } });
    const photo = await mkAngle("PHOTO");
    const video = await mkAngle("VIDEO");

    await check("only the contributor sets a sound; unknown keys are refused", async () => {
      await assert.rejects(setAngleSound(other, photo.id, "n01", false), (e) => e instanceof SoundError && e.code === "forbidden");
      await assert.rejects(setAngleSound(owner, photo.id, "nope", false), (e) => e instanceof SoundError && e.code === "invalid");
      assert.deepEqual(await setAngleSound(owner, photo.id, "n01", true), { soundKey: "n01", muteOriginal: false }); // a photo has no sound of its own
      const view = await getMomentView(m.code, owner);
      assert.equal(view?.angles.find((a) => a.id === photo.id)?.soundKey, "n01");
    });

    await check("video: mute is the contributor's choice — always muted under Quran and remembrance", async () => {
      assert.deepEqual(await setAngleSound(owner, video.id, "n02", false), { soundKey: "n02", muteOriginal: false });
      assert.deepEqual(await setAngleSound(owner, video.id, "n02", true), { soundKey: "n02", muteOriginal: true });
      assert.deepEqual(await setAngleSound(owner, video.id, "s01", false), { soundKey: "s01", muteOriginal: true });
      assert.deepEqual(await setAngleSound(owner, video.id, "q15", false), { soundKey: "q15", muteOriginal: true }); // Quran: always alone
      assert.deepEqual(await setAngleSound(owner, video.id, null, true), { soundKey: null, muteOriginal: false });
    });

    await check("uses count every shot; the sound page lists only public, checked ones", async () => {
      const before = await soundUses("n01");
      await setAngleSound(owner, video.id, "n01", false);
      assert.equal(await soundUses("n01"), before + 1);
      assert.ok(!(await soundShots(null, "n01")).some((s) => s.id === photo.id), "friends-only moment: not listed");
      await db.moment.update({ where: { id: m.id }, data: { visibility: "PUBLIC" } });
      const listed = (await soundShots(null, "n01")).map((s) => s.id);
      assert.ok(listed.includes(photo.id) && listed.includes(video.id));
    });

    await check("montage: the sound is part of what makes it new", async () => {
      const a = await requestMontage(owner, m.code, "n03");
      assert.equal(a.created, true);
      assert.equal(a.montage.soundKey, "n03");
      assert.equal((await requestMontage(owner, m.code, "n03")).created, false);
      assert.equal((await requestMontage(owner, m.code, null)).created, true);
      assert.equal((await requestMontage(owner, m.code, "not-a-sound")).montage.soundKey, null);
    });
  } finally {
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
