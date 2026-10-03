// Integration test for «🎤 صوتك» (src/server/user-sounds.ts): members add a sound from the picker
// — for everyone, or «🔒 خاص» (only for themselves) — and who may put which sound on a shot.
// The listening itself needs Gemini (tested by hand); here it is off, so a new sound is held back
// as unchecked, which is the rule. Run: npx tsx tests/user-sounds.integration.ts — every row it
// creates is removed.
import "./env";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { isPeopleKey, soundByKey, soundFile } from "../src/lib/sounds";
import { ffmpeg } from "../src/server/ffmpeg";
import { setAngleSound, SoundError } from "../src/server/sounds";
import { addSound, peopleSounds, setSoundShared, usableSound, UserSoundError } from "../src/server/user-sounds";

const TAG = "[usersoundtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

// A short tone, as a phone would send a recording.
async function tone(seconds: number) {
  const dir = await mkdtemp(join(tmpdir(), "usersoundtest-"));
  try {
    const file = join(dir, "tone.wav");
    await ffmpeg(["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, file]);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  delete process.env.GEMINI_API_KEY; // the check can't be made: never live unchecked
  const mk = (n: string, isGuest = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest } });
  const [owner, other, guest] = [await mk("owner"), await mk("other"), await mk("guest", true)];
  const ids = [owner.id, other.id, guest.id];
  let n = 0;
  const moment = () => db.moment.create({ data: { code: `US${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: TAG, creatorId: owner.id, visibility: "PUBLIC" } as never });
  const shot = (momentId: string, contributorId: string) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "VIDEO", status: "READY", screening: "allowed", mediaPath: `usersoundtest/${Math.random()}.mp4` } });
  const live = (key: string, ownerId: string, shared: boolean) => db.userSound.create({ data: { key, ownerId, name: `${TAG} ${key}`, seconds: 10, status: "public", path: `usersoundtest/${key}.mp3`, shared } });
  try {
    await check("members only; too big or empty refused; unchecked → held back, not live", async () => {
      const sound = await tone(3);
      await assert.rejects(addSound(guest, sound, {}), (e) => e instanceof UserSoundError && e.code === "members_only");
      await assert.rejects(addSound(owner, Buffer.alloc(4_100_000), {}), (e) => e instanceof UserSoundError && e.code === "too_big");
      await assert.rejects(addSound(owner, Buffer.alloc(500), {}), (e) => e instanceof UserSoundError && e.code === "no_audio");
      const added = await addSound(owner, sound, { name: ' «ضحكة» ', shared: "false" });
      assert.equal(added.status, "blocked");
      assert.equal(added.reason, "check_failed");
      assert.equal(added.path, null);
      assert.equal(added.name, "ضحكة");
      assert.equal(added.shared, false);
      assert.ok(added.seconds > 2.5 && added.seconds <= 3.1);
      assert.ok(isPeopleKey(added.key));
    });

    await check("a shared sound is everyone's; a «🔒 خاص» one only its owner's", async () => {
      const m = await moment();
      const [mine, theirs] = [await shot(m.id, owner.id), await shot(m.id, other.id)];
      await live("u0123456789aa", owner.id, true);
      await live("u0123456789ab", owner.id, false);
      assert.equal((await setAngleSound(other, theirs.id, "u0123456789aa", false)).soundKey, "u0123456789aa");
      await assert.rejects(setAngleSound(other, theirs.id, "u0123456789ab", false), (e) => e instanceof SoundError && e.code === "invalid");
      assert.equal((await setAngleSound(owner, mine.id, "u0123456789ab", false)).soundKey, "u0123456789ab");
      assert.equal(await usableSound(other.id, "u0123456789ab"), false);
      await db.userSound.update({ where: { key: "u0123456789aa" }, data: { status: "blocked" } });
      assert.equal(await usableSound(other.id, "u0123456789aa"), false, "blocked: nobody");
    });

    await check("the picker: my sounds first (shared or private), then everyone's shared ones", async () => {
      await live("u0123456789ac", other.id, true);
      await live("u0123456789ad", other.id, false);
      const forOwner = (await peopleSounds(owner.id, 200)).filter((s) => s.name.startsWith(TAG));
      assert.deepEqual(forOwner.map((s) => [s.key, s.mine, s.shared]), [["u0123456789ab", true, false], ["u0123456789ac", false, true]]);
      const forVisitor = (await peopleSounds(null, 200)).filter((s) => s.name.startsWith(TAG));
      assert.deepEqual(forVisitor.map((s) => s.key), ["u0123456789ac"]);
    });

    await check("its owner switches it between everyone and private; nobody else can", async () => {
      assert.equal((await setSoundShared(owner, "u0123456789ab", true)).shared, true);
      assert.equal(await usableSound(other.id, "u0123456789ab"), true);
      await assert.rejects(setSoundShared(other, "u0123456789ab", false), (e) => e instanceof UserSoundError && e.code === "not_found");
    });

    await check("a person's sound plays like a library one", async () => {
      assert.ok(soundByKey("u0123456789ab")?.cat === "people");
      assert.equal(soundFile("u0123456789ab"), "/sounds/u/u0123456789ab.mp3");
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
