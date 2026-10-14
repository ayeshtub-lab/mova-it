// Integration test for «اكتشف ← لحظات» search (src/server/moment-search.ts findMoments): any
// spelling finds a public moment (ة/ه، أ/ا), every word must match, and friends-only moments
// never show. Run: npx tsx tests/moment-search.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { findMoments } from "../src/server/moment-search";

const TAG = "[searchtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const user = await db.user.create({ data: { displayName: `${TAG} cook` } });
  try {
    const moment = (title: string, visibility: string) =>
      db.moment.create({ data: { code: `SR${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title, creatorId: user.id, visibility } as never });
    const shot = (momentId: string) => db.angle.create({ data: { momentId, contributorId: user.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "searchtest/x.jpg" } });
    const open = await moment("صفيحة لحمة زقزقية أصلية", "PUBLIC");
    await shot(open.id);
    const friends = await moment("صفيحة لحمة زقزقية للأصحاب", "FRIENDS");
    await shot(friends.id);
    const empty = await moment("صفيحة لحمة زقزقية فاضية", "PUBLIC");

    await check("any spelling finds the public moment", async () => {
      for (const q of ["صفيحه زقزقيه", "زقزقية", "اصلية"]) {
        const codes = (await findMoments(null, q)).map((c) => c.code);
        assert.ok(codes.includes(open.code), q);
      }
    });
    await check("every word must match", async () => {
      assert.ok(!(await findMoments(null, "زقزقية كنافة")).some((c) => c.code === open.code));
    });
    await check("friends-only and empty moments never show", async () => {
      const codes = (await findMoments(null, "زقزقية")).map((c) => c.code);
      assert.ok(!codes.includes(friends.code) && !codes.includes(empty.code));
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: user.id } });
    await db.moment.deleteMany({ where: { creatorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
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
