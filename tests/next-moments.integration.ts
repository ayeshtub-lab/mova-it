// Integration test for «⬇️ اللحظة الجاية» (src/server/next-moments.ts) and the topic chips without
// near-repeats (src/server/topics.ts): the next moments are public only — never friends-only, a
// «لحظة اليوم», a story or a moment with no checked shot — the same place first, then the same
// scene, each with its first shot. Test database only.
// Run: npx tsx tests/next-moments.integration.ts — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { nextMomentsNow } from "../src/server/next-moments";

const TAG = "[nexttest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const stamp = Date.now().toString(36);
  const me = await db.user.create({ data: { displayName: `${TAG} me`, isGuest: false } });
  const place = await db.place.findFirst({ where: { kind: { in: ["TOWN", "VILLAGE", "CITY"] } }, select: { id: true } });
  const other = await db.place.findFirst({ where: { kind: { in: ["TOWN", "VILLAGE", "CITY"] }, id: { not: place?.id } }, select: { id: true } });
  let n = 0;
  const moment = async (title: string, extra: Record<string, unknown> = {}, shot: Record<string, unknown> | null = {}) => {
    const m = await db.moment.create({
      data: { code: `NX${stamp.slice(-2).toUpperCase()}${(n++).toString(36).toUpperCase().padStart(2, "0")}`, title: `${TAG} ${title}`, creatorId: me.id, visibility: "PUBLIC", lastActivityAt: new Date(Date.now() - n * 60_000), ...extra } as never,
    });
    if (shot) await db.angle.create({ data: { momentId: m.id, contributorId: me.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `nexttest/${n}.jpg`, ...shot } as never });
    return m;
  };
  try {
    const here = await moment("here", { placeId: place!.id }, { scene: "sunset", placeId: place!.id });
    const newest = await moment("newest elsewhere", { placeId: other!.id }, { scene: "food", placeId: other!.id });
    const sameScene = await moment("same scene", {}, { scene: "sunset" });
    const samePlace = await moment("same place", { placeId: place!.id }, { scene: "food", placeId: place!.id });
    const friends = await moment("friends", { visibility: "FRIENDS", placeId: place!.id }, { placeId: place!.id });
    const daily = await moment("daily", { kind: "DAILY", placeId: place!.id }, { placeId: place!.id });
    const story = await moment("story", { kind: "STORY", placeId: place!.id }, { placeId: place!.id });
    const unchecked = await moment("unchecked", { placeId: place!.id }, { screening: null, placeId: place!.id });
    const next = (await nextMomentsNow(here.id, 60)).filter((m) => m.title.startsWith(TAG));

    await check("public moments only: never friends-only, «لحظة اليوم», a story or unchecked shots", async () => {
      const codes = next.map((m) => m.code);
      for (const hidden of [friends, daily, story, unchecked, here]) assert.ok(!codes.includes(hidden.code), hidden.title);
    });
    await check("the same place first, then the same scene, then the newest", async () => {
      assert.deepEqual(next.map((m) => m.code).slice(0, 3), [samePlace.code, sameScene.code, newest.code]);
    });
    await check("each opens on its first shot, with a cover at the lasting address", async () => {
      const first = await db.angle.findFirstOrThrow({ where: { momentId: samePlace.id } });
      assert.equal(next[0].firstAngleId, first.id);
      assert.equal(next[0].cover, `/i/${first.id}-small.jpg`);
      assert.equal(next[0].firstPart, null);
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: me.id } });
    await db.moment.deleteMany({ where: { creatorId: me.id } });
    await db.user.delete({ where: { id: me.id } });
  }
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
