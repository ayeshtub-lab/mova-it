// Integration test for «منسّق المكتبة» (src/server/sound-resolve.ts): only a curator puts a member's
// live sound in a library list; the list must be a real one; in «قرآن» the sound is solemn —
// resolved with its list and real length, and a video under it is muted, like the library's
// verses; the picker's list carries it; «🎤 من الناس» takes it back.
// Run: npx tsx tests/sound-curator.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { isSolemn } from "../src/lib/sounds";
import { isCurator, resolveSound, setSoundList } from "../src/server/sound-resolve";
import { setAngleSound } from "../src/server/sounds";
import { peopleSounds } from "../src/server/user-sounds";

const TAG = "[curatortest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string, data: object = {}) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, ...data } });
  const [curator, member] = [await mk("curator", { soundCurator: true }), await mk("member")];
  const ids = [curator.id, member.id];
  const key = `u${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  try {
    await db.userSound.create({ data: { key, ownerId: member.id, name: "تلاوة", seconds: 7.7, status: "public", path: `sounds/u/${key}.mp3`, shared: true } });

    await check("only a curator lists a sound, and only in a real list", async () => {
      assert.equal(isCurator(curator), true);
      assert.equal(isCurator(member), false);
      assert.equal(await setSoundList(member, key, "quran"), null, "a member can't");
      assert.equal(await setSoundList(curator, key, "nonsense"), null, "no such list");
      assert.equal((await setSoundList(curator, key, "quran"))?.category, "quran");
    });

    await check("in «قرآن» it is solemn, with its real length — and a video under it is muted", async () => {
      const sound = await resolveSound(key);
      assert.equal(sound?.cat, "quran");
      assert.equal(sound?.seconds, 7.7);
      assert.ok(isSolemn(sound));
      const m = await db.moment.create({ data: { code: `CU${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "اختبار", creatorId: member.id } });
      const v = await db.angle.create({ data: { momentId: m.id, contributorId: member.id, mediaType: "VIDEO", status: "READY", screening: "allowed", mediaPath: "curatortest/v.mp4" } });
      assert.equal((await setAngleSound(member, v.id, key, false)).muteOriginal, true);
    });

    await check("the picker's list carries it; «🎤 من الناس» takes it back", async () => {
      assert.equal((await peopleSounds(curator.id, 200)).find((s) => s.key === key)?.category, "quran");
      assert.equal((await setSoundList(curator, key, "people"))?.category, null);
      assert.equal((await resolveSound(key))?.cat, "people");
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.userSound.deleteMany({ where: { ownerId: { in: ids } } });
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
