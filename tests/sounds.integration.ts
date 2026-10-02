// Integration test for the sound library (src/server/sounds.ts, montage requests).
// Run: npx tsx tests/sounds.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createMoment, getMomentView } from "../src/server/moments";
import { MontageError, requestMontage } from "../src/server/montage";
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
      assert.deepEqual(await setAngleSound(owner, photo.id, "n01", true), { soundKey: "n01", muteOriginal: false, lyrics: true }); // a photo has no sound of its own
      const view = await getMomentView(m.code, owner);
      assert.equal(view?.angles.find((a) => a.id === photo.id)?.soundKey, "n01");
    });

    await check("«📝» a sound's words: on unless the contributor turns them off", async () => {
      assert.equal((await setAngleSound(owner, video.id, "s14", false)).lyrics, true);
      assert.equal((await setAngleSound(owner, video.id, "s14", false, false)).lyrics, false);
      assert.equal((await db.angle.findUnique({ where: { id: video.id } }))?.lyrics, false);
      assert.equal((await setAngleSound(owner, video.id, "s14", false, "junk")).lyrics, true);
    });

    await check("video: mute is the contributor's choice — always muted under Quran and remembrance", async () => {
      assert.deepEqual(await setAngleSound(owner, video.id, "n02", false), { soundKey: "n02", muteOriginal: false, lyrics: true });
      assert.deepEqual(await setAngleSound(owner, video.id, "n02", true), { soundKey: "n02", muteOriginal: true, lyrics: true });
      assert.deepEqual(await setAngleSound(owner, video.id, "s01", false), { soundKey: "s01", muteOriginal: true, lyrics: true });
      assert.deepEqual(await setAngleSound(owner, video.id, "q15", false), { soundKey: "q15", muteOriginal: true, lyrics: true }); // Quran: always alone
      assert.deepEqual(await setAngleSound(owner, video.id, null, true), { soundKey: null, muteOriginal: false, lyrics: true });
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

    await check("montage: from 5 angles, made by the owner of the first angle", async () => {
      await assert.rejects(requestMontage(owner, m.code, null), (e) => e instanceof MontageError && e.code === "too_few");
      for (let i = 0; i < 3; i++) {
        await db.angle.create({ data: { momentId: m.id, contributorId: other.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x", uploadedAt: new Date(Date.now() + (i + 1) * 1000) } });
      }
      await assert.rejects(requestMontage(other, m.code, null), (e) => e instanceof MontageError && e.code === "not_maker");
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
