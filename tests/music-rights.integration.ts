// «🎵 الأصوات» for videos already up (src/server/music-rights.ts, 2026-11-27): their owners are told
// once per video (one push each), and 48 hours on, a video still with its own sound gets a library
// sound (never the Quran) and its own sound off; one whose owner chose a sound meanwhile is left.
// Run: npx tsx tests/music-rights.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { soundByKey } from "../src/lib/sounds";
import { MUSIC_GRACE_MS, noticeMusic, settleMusic } from "../src/server/music-rights";
import { setAngleSound } from "../src/server/sounds";

const TAG = "[musicrightstest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const me = await db.user.create({ data: { displayName: `${TAG} me`, isGuest: false } });
  try {
    const m = await db.moment.create({ data: { code: `MR${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "z", visibility: "PUBLIC", creatorId: me.id, participants: { create: { userId: me.id, role: "HOST" } } } });
    const video = (aiTitle: string, scene: string) => db.angle.create({ data: { momentId: m.id, contributorId: me.id, mediaType: "VIDEO", status: "READY", screening: "allowed", mediaPath: "x.mp4", aiTitle, scene } });
    const [rain, coffee, chosen] = [await video("أجواء المطر في الشارع ليلا", "rain"), await video("فنجان قهوة الصباح", "food"), await video("غروب الشمس", "sunset")];

    await check("told once per video, the videos marked", async () => {
      const told = await noticeMusic([rain, coffee, chosen].map((v) => ({ angleId: v.id, reason: "pop song" })));
      assert.equal(told, 3);
      assert.equal(await noticeMusic([{ angleId: rain.id, reason: "pop song" }]), 0, "never twice");
      assert.equal(await db.notification.count({ where: { userId: me.id, kind: "MUSIC_RIGHTS" } }), 3);
      assert.ok((await db.angle.findUniqueOrThrow({ where: { id: rain.id } })).musicNote);
    });

    await check("its owner picks a sound meanwhile: its own sound off, left alone after", async () => {
      await setAngleSound(me, chosen.id, "n02", false);
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: chosen.id } })).muteOriginal, true);
    });

    await check("before 48 hours nothing changes; after, a library sound (not the Quran), its own sound off", async () => {
      assert.equal((await settleMusic("zawmo.com")).length, 0);
      const later = new Date(Date.now() + MUSIC_GRACE_MS + 60_000);
      const changed = await settleMusic("zawmo.com", later);
      assert.deepEqual(changed.map((c) => c.id).sort(), [rain.id, coffee.id].sort());
      for (const v of [rain, coffee]) {
        const a = await db.angle.findUniqueOrThrow({ where: { id: v.id } });
        assert.equal(a.muteOriginal, true);
        assert.ok(a.soundKey && soundByKey(a.soundKey)?.cat !== "quran", a.soundKey ?? "none");
      }
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: chosen.id } })).soundKey, "n02", "its owner's choice kept");
    });
  } finally {
    await db.notification.deleteMany({ where: { userId: me.id } });
    await db.angle.deleteMany({ where: { contributorId: me.id } });
    await db.participant.deleteMany({ where: { userId: me.id } });
    await db.moment.deleteMany({ where: { creatorId: me.id } });
    await db.user.delete({ where: { id: me.id } });
  }
  console.log(out.join("\n") + `\n\n${out.length} checks passed`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
