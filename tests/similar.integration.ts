// Integration test for «📸 لقطات بتشبهها» (src/server/similar.ts): the search over shots' vectors —
// public shots only, never the shot itself, by picture or by words, at most 2 from one moment,
// nothing from people the viewer blocked, and from a private moment only for those who see it.
// The vectors are made up here (making real ones needs Gemini, checked by hand).
// Run: npx tsx tests/similar.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { SimilarError, similarShots } from "../src/server/similar";

const TAG = "[similartest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

// A 768-number vector leaning towards axes `a` (and a little `b`).
function vec(a: number, b = -1, lean = 0) {
  const v = new Array(768).fill(0);
  v[a] = 1 - lean;
  if (b >= 0) v[b] = lean;
  return `[${v.join(",")}]`;
}

async function main() {
  delete process.env.GEMINI_API_KEY; // nothing is made on the way: only the vectors put here
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other, viewer] = [await mk("owner"), await mk("other"), await mk("viewer")];
  const ids = [owner.id, other.id, viewer.id];
  let n = 0;
  const moment = (visibility: string, creatorId = owner.id) =>
    db.moment.create({ data: { code: `SM${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: TAG, creatorId, visibility } as never });
  const shot = async (momentId: string, kind: "image" | "text", v: string, contributorId = owner.id) => {
    const a = await db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `similartest/${Math.random()}.jpg` } });
    await db.$executeRaw`INSERT INTO "AngleVector" ("angleId", "kind", "vec") VALUES (${a.id}, ${kind}, ${v}::vector)`;
    return a;
  };
  try {
    const pub = await moment("PUBLIC");
    const pub2 = await moment("PUBLIC", other.id);
    const priv = await moment("FRIENDS");
    const sunset = await shot(pub.id, "image", vec(1));
    const sunset2 = await shot(pub2.id, "image", vec(1, 2, 0.1), other.id);
    const food = await shot(pub2.id, "image", vec(5), other.id);
    const hidden = await shot(priv.id, "image", vec(1));
    const party = await shot(pub.id, "text", vec(1)); // same numbers, but words: never mixed with pictures
    const party2 = await shot(pub2.id, "text", vec(1, 3, 0.2), other.id);

    await check("the closest public shot, not itself, not a private one, not something unlike it", async () => {
      const got = await similarShots(null, sunset.id);
      assert.deepEqual(got.map((s) => s.id), [sunset2.id]);
      assert.ok(!got.some((s) => s.id === hidden.id || s.id === food.id));
    });

    await check("a shot of people is matched by words only — never against pictures", async () => {
      assert.deepEqual((await similarShots(viewer, party.id)).map((s) => s.id), [party2.id]);
    });

    await check("from a private moment: only for those who see it; the results are still public", async () => {
      await assert.rejects(similarShots(null, hidden.id), (e) => e instanceof SimilarError);
      await assert.rejects(similarShots(viewer, hidden.id), (e) => e instanceof SimilarError);
      const mine = (await similarShots(owner, hidden.id)).map((s) => s.id);
      assert.deepEqual(mine, [sunset.id, sunset2.id]);
    });

    await check("at most 2 from one moment; nothing from people the viewer blocked", async () => {
      for (let i = 0; i < 3; i++) await shot(pub2.id, "image", vec(1, 2, 0.05), other.id);
      const got = await similarShots(viewer, sunset.id);
      assert.equal(got.filter((s) => s.momentCode === pub2.code).length, 2);
      await db.block.create({ data: { blockerId: viewer.id, blockedId: other.id } });
      assert.deepEqual(await similarShots(viewer, sunset.id), []);
    });
  } finally {
    await db.block.deleteMany({ where: { blockerId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } }); // vectors go with them
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = await db.user.count({ where: { displayName: { startsWith: TAG } } });
    out.push(left === 0 ? "CLEANUP ok" : `CLEANUP left ${left}`);
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
