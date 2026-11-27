// «🎤 احكيها بصوتك» (2026-11-27): a story that came from speaking is saved marked as voice (to tell it
// from typed stories when the stories test is read); clearing the words clears the mark; typing over
// it keeps it; someone else's shot can't be written down; the shot's scene comes with its story (for
// the question asked while recording). Gemini itself isn't called here: no sound is ever sent.
// Run: npx tsx tests/voice-note.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { AngleError, setShotNote, shotNote } from "../src/server/angles";
import { voiceToText } from "../src/server/voice-note";

const TAG = "[voicenotetest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const me = await db.user.create({ data: { displayName: `${TAG} me`, isGuest: false } });
  const other = await db.user.create({ data: { displayName: `${TAG} other`, isGuest: false } });
  try {
    // FRIENDS: the words aren't sent to the public-words check
    const m = await db.moment.create({ data: { code: `VN${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "z", visibility: "FRIENDS", creatorId: me.id, participants: { create: { userId: me.id, role: "HOST" } } } });
    const shot = await db.angle.create({ data: { momentId: m.id, contributorId: me.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x.jpg", scene: "food" } });
    const voiceOf = async () => (await db.angle.findUniqueOrThrow({ where: { id: shot.id } })).noteVoice;

    await check("the scene comes with the story", async () => {
      assert.deepEqual(await shotNote(me, shot.id), { note: "", scene: "food" });
    });
    await check("typed words: not voice", async () => {
      await setShotNote(me, shot.id, "مقلوبة ستي");
      assert.equal(await voiceOf(), false);
    });
    await check("spoken words: voice", async () => {
      await setShotNote(me, shot.id, "مقلوبة ستي، بنعملها كل جمعة", true);
      assert.equal(await voiceOf(), true);
    });
    await check("typed over afterwards: still voice", async () => {
      await setShotNote(me, shot.id, "مقلوبة ستي، بنعملها كل جمعة لما تجتمع العيلة");
      assert.equal(await voiceOf(), true);
    });
    await check("cleared: the mark goes too", async () => {
      await setShotNote(me, shot.id, "");
      assert.equal(await voiceOf(), false);
    });
    await check("someone else's shot: not found", async () => {
      await assert.rejects(() => shotNote(other, shot.id), (e) => e instanceof AngleError && e.code === "not_found");
    });
    await check("not a sound at all: unclear, nothing sent", async () => {
      assert.deepEqual(await voiceToText(Buffer.from("x".repeat(4000)), "ar"), process.env.GEMINI_API_KEY ? { result: "unclear" } : { result: "failed" });
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: { in: [me.id, other.id] } } });
    await db.participant.deleteMany({ where: { userId: { in: [me.id, other.id] } } });
    await db.moment.deleteMany({ where: { creatorId: { in: [me.id, other.id] } } });
    await db.user.deleteMany({ where: { id: { in: [me.id, other.id] } } });
    await db.$disconnect();
  }
}

main()
  .then(() => console.log(out.join("\n") + `\n${out.length} checks`))
  .catch((error) => {
    console.log(out.join("\n"));
    console.error("FAIL", error);
    process.exit(1);
  });
