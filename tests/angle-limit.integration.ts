// Integration test for one person's shots on one moment (2026-11-09: his «من انتاج مزرعتي» stopped
// taking photos at 29 of 30): 100 a person now, and an upload that never finished counts only for
// its first half hour — not the 3 hours until the cleanup deletes it.
// Run: npx tsx tests/angle-limit.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { AngleError, prepareAngle } from "../src/server/angles";
import { createMoment } from "../src/server/moments";

const TAG = "[limittest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const tooMany = (e: unknown) => e instanceof AngleError && e.code === "too_many";

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  try {
    const m = await createMoment(owner, { title: `${TAG} farm` });
    const shots = (n: number, status: "READY" | "PROCESSING", minutesAgo = 0) =>
      db.angle.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          momentId: m.id,
          contributorId: owner.id,
          mediaType: "PHOTO" as const,
          status,
          mediaPath: `test/${TAG}-${status}-${minutesAgo}-${i}.jpg`,
          uploadedAt: new Date(Date.now() - minutesAgo * 60_000),
        })),
      });

    await check("past 30 shots, a person still adds more", async () => {
      await shots(30, "READY");
      await prepareAngle(owner, { code: m.code, mediaType: "PHOTO" });
    });

    await check("an upload that never finished stops counting after half an hour", async () => {
      await shots(68, "READY"); // 30 + 1 reserved above + 68 = 99
      await shots(3, "PROCESSING", 45); // failed an hour ago: not counted
      await prepareAngle(owner, { code: m.code, mediaType: "PHOTO" }); // the 100th
    });

    await check("at 100, the next is refused", async () => {
      await assert.rejects(prepareAngle(owner, { code: m.code, mediaType: "PHOTO" }), tooMany);
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } });
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
