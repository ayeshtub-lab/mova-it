// Integration test for a moment's description growing with its shots (src/server/moment-summary.ts):
// rewritten from all its shots at the 3rd, 5th, 10th… shot — only while Zawmo wrote it, never
// a creator's own words, never a moment made before (descriptionAuto false), hashtags only from
// its shots. Gemini and the text check are stand-ins here.
// Run: npx tsx tests/moment-summary.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { commonTags, refreshMomentSummary, summaryDue, summaryLine } from "../src/server/moment-summary";
import { updateMomentDetails } from "../src/server/moments";

const TAG = `ms-${Math.random().toString(36).slice(2, 7)}`;
const out: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  out.push("PASS " + name);
}

const LINES = [
  "أرنب أبيض صغير يجلس على العشب في حديقة البيت، صورة حقيقية #أرنب #حيوانات #حديقة",
  "ماعز بني يأكل العشب قرب سياج خشبي في مزرعة، صورة حقيقية #ماعز #حيوانات #مزرعة",
  "قطة رمادية نائمة على كرسي في ساحة البيت، صورة حقيقية #قطط #حيوانات",
  "دجاجات بيضاء تبحث عن الحب في المزرعة، صورة حقيقية #دجاج #حيوانات #مزرعة",
  "ماعز صغير يقفز على صخرة، صورة حقيقية #ماعز #حيوانات",
];

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} سلمى`, isGuest: false } });
  const asked: string[][] = [];
  const ask = async (_title: string, lines: string[]) => {
    asked.push(lines);
    return { description: "صور حقيقية لحيوانات البيت والمزرعة: أرنب أبيض وماعز وقطة ودجاجات بين العشب والسياج", hashtags: ["حيوانات", "ماعز", "مكياج"] };
  };
  const screen = async () => ({ result: "allowed" as const });
  const made = async (auto: boolean, n: number, visibility: "PUBLIC" | "FRIENDS" = "PUBLIC", description = LINES[0]) => {
    const m = await db.moment.create({ data: { code: `MS${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "حيوانات", visibility, creatorId: owner.id, description, descriptionAuto: auto } });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = await db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", aiText: LINES[i % LINES.length], uploadedAt: new Date(Date.now() + i * 1000) } });
      ids.push(a.id);
    }
    return { m, last: ids[ids.length - 1] };
  };
  try {
    await check("due at the 3rd, 5th and 10th shot, then every 10th — never at every shot", async () => {
      assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 10, 11, 20, 25, 30].filter(summaryDue), [3, 5, 10, 20, 30]);
    });

    await check("the line covers the whole moment; hashtags only from its shots (none made up)", async () => {
      const tags = commonTags(LINES);
      assert.equal(tags[0], "حيوانات", "the most shared first");
      const line = summaryLine({ description: "صور حقيقية لأرنب وماعز وقطة في البيت", hashtags: ["#حيوانات", "مكياج", "ماعز"] }, tags)!;
      assert.ok(line.includes("#حيوانات") && line.includes("#ماعز") && !line.includes("مكياج"), line);
      assert.ok(line.length <= 150);
      assert.equal(summaryLine({ description: "قصير" }, tags), null, "too short: left as it is");
    });

    await check("Zawmo's description is rewritten at the 3rd shot (the rabbit line → all the animals)", async () => {
      const { m, last } = await made(true, 3);
      await refreshMomentSummary(last, { ask, screen });
      const after = await db.moment.findUniqueOrThrow({ where: { id: m.id } });
      assert.notEqual(after.description, LINES[0]);
      assert.ok(after.description!.includes("ماعز") && after.description!.includes("#حيوانات"), after.description!);
      assert.ok(after.descriptionAuto, "still Zawmo's: it goes on growing");
      assert.equal(asked.at(-1)!.length, 3, "all its shots were read");
    });

    await check("not at the 4th shot (no change between the steps)", async () => {
      const { m, last } = await made(true, 4);
      const before = asked.length;
      await refreshMomentSummary(last, { ask, screen });
      assert.equal(asked.length, before, "Gemini not asked");
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).description, LINES[0]);
    });

    await check("a moment from before (not marked as Zawmo's) is never touched", async () => {
      const { m, last } = await made(false, 3);
      await refreshMomentSummary(last, { ask, screen });
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).description, LINES[0]);
    });

    await check("its creator's own words stop it for good; a title-only edit does not", async () => {
      // (friends only: tests have no text check, and a public description must pass one)
      const { m, last } = await made(true, 3, "FRIENDS");
      await updateMomentDetails(owner, m.code, { title: "حيوانات المزرعة", description: LINES[0] });
      assert.ok((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).descriptionAuto, "title only: still Zawmo's");
      await updateMomentDetails(owner, m.code, { title: "حيوانات المزرعة", description: "حيواناتنا الحلوة #حيوانات" });
      const edited = await db.moment.findUniqueOrThrow({ where: { id: m.id } });
      assert.equal(edited.descriptionAuto, false);
      await refreshMomentSummary(last, { ask, screen });
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).description, "حيواناتنا الحلوة #حيوانات");
    });

    await check("a public line that fails the text check, or Gemini failing, leaves it as it was", async () => {
      const { m, last } = await made(true, 3);
      await refreshMomentSummary(last, { ask, screen: async () => ({ result: "blocked" as const, category: "other", reason: "x" }) });
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).description, LINES[0]);
      await refreshMomentSummary(last, { ask: async () => { throw new Error("busy"); }, screen });
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: m.id } })).description, LINES[0]);
    });
  } finally {
    const moments = await db.moment.findMany({ where: { creatorId: owner.id }, select: { id: true } });
    await db.angle.deleteMany({ where: { momentId: { in: moments.map((x) => x.id) } } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
  for (const line of out) console.log(line);
  console.log(`${out.length}/7 passed`);
}

main().catch((error) => {
  console.log("FAIL", error);
  process.exit(1);
});
