// 🎵 Recorded music on a video (2026-11-27): its own sound goes off and stays off whatever its owner
// picks (a library sound may go on it); it still publishes, silent.
// Run: npx tsx tests/music.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { publishAngle } from "../src/server/angles";
import { setAngleSound } from "../src/server/sounds";

const TAG = "[musictest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const me = await db.user.create({ data: { displayName: `${TAG} me`, isGuest: false } });
  try {
    const m = await db.moment.create({ data: { code: `MU${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "z", visibility: "PUBLIC", creatorId: me.id, participants: { create: { userId: me.id, role: "HOST" } } } });
    const video = (musicNote: string | null) => db.angle.create({ data: { momentId: m.id, contributorId: me.id, mediaType: "VIDEO", status: "DRAFT", screening: "allowed", mediaPath: "x.mp4", musicNote, muteOriginal: !!musicNote } });

    await check("with recorded music: its own sound stays off, whatever its owner asks", async () => {
      const v = await video("pop song with lyrics");
      assert.equal((await setAngleSound(me, v.id, null, false)).muteOriginal, true);
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: v.id } })).muteOriginal, true);
    });

    await check("without music: as before — taking a library sound away brings its own sound back", async () => {
      const v = await video(null);
      assert.equal((await setAngleSound(me, v.id, "n02", true)).muteOriginal, true);
      assert.equal((await setAngleSound(me, v.id, null, true)).muteOriginal, false);
    });

    await check("it still publishes — silent", async () => {
      const v = await video("recorded nasheed");
      const up = await publishAngle(me, v.id);
      assert.equal(up.status, "READY");
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: v.id } })).muteOriginal, true);
    });
  } finally {
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
