// Integration test for «نشر» pressed before the check ends (src/server/angles.ts publishAngle):
// a shot still on its way is remembered (autoPublish) and an unnamed moment takes its name at
// once; a checked draft goes up as before. Run: npx tsx tests/auto-publish.integration.ts —
// every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { publishAngle } from "../src/server/angles";

const TAG = "[autopubtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const user = await db.user.create({ data: { displayName: `${TAG} shooter` } });
  try {
    const moment = await db.moment.create({ data: { code: `AP${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "", named: false, creatorId: user.id, visibility: "FRIENDS" } as never });
    const shot = (status: string) => db.angle.create({ data: { momentId: moment.id, contributorId: user.id, mediaType: "VIDEO", status, mediaPath: "autopubtest/x.mp4" } as never });

    await check("on its way: remembered, and the moment named now", async () => {
      const a = await shot("PROCESSING");
      const res = await publishAngle(user, a.id, "أفعى بالحديقة");
      assert.equal(res.status, "PROCESSING");
      const after = await db.angle.findUniqueOrThrow({ where: { id: a.id } });
      assert.equal(after.autoPublish, true);
      assert.equal(after.status, "PROCESSING");
      const m = await db.moment.findUniqueOrThrow({ where: { id: moment.id } });
      assert.equal(m.title, "أفعى بالحديقة");
      assert.equal(m.named, true);
    });
    await check("a checked draft goes up as before", async () => {
      const a = await shot("DRAFT");
      const res = await publishAngle(user, a.id);
      assert.equal(res.status, "READY");
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: a.id } })).autoPublish, false);
    });
    await check("someone else's shot: refused", async () => {
      const other = await db.user.create({ data: { displayName: `${TAG} other` } });
      const a = await shot("PROCESSING");
      await assert.rejects(() => publishAngle(other, a.id, "x"));
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: a.id } })).autoPublish, false);
    });
  } finally {
    const ids = (await db.user.findMany({ where: { displayName: { startsWith: TAG } }, select: { id: true } })).map((u) => u.id);
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
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
