// Integration test for who may get a video shot's stamped copy (src/server/branded.ts
// brandedShotUrl): since 2026-10-17 visitors too — but only for a public shot that passed the check;
// never a friends-only one, nor one still unchecked, nor a photo.
// Run: npx tsx tests/branded-access.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { BrandedError, brandedShotUrl } from "../src/server/branded";

const TAG = "[brandtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const refused = (code: string) => (error: unknown) => error instanceof BrandedError && error.code === code;

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const other = await db.user.create({ data: { displayName: `${TAG} other`, isGuest: false } });
  try {
    const code = () => `BT${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const friends = await db.moment.create({ data: { code: code(), title: `${TAG} f`, visibility: "FRIENDS", creatorId: owner.id } });
    const open = await db.moment.create({ data: { code: code(), title: `${TAG} p`, visibility: "PUBLIC", creatorId: owner.id } });
    const shot = (momentId: string, extra: object = {}) =>
      db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "VIDEO", status: "READY", mediaPath: `m/${momentId}/x.mp4`, screening: "allowed", ...extra } });

    await check("a visitor can't have a friends-only shot", async () => {
      const a = await shot(friends.id);
      await assert.rejects(brandedShotUrl(null, a.id), refused("not_found"));
    });
    await check("…nor someone else signed in", async () => {
      const a = await shot(friends.id);
      await assert.rejects(brandedShotUrl(other, a.id), refused("not_found"));
    });
    await check("…nor a public shot not yet passed by the check", async () => {
      const a = await shot(open.id, { screening: "pending" });
      await assert.rejects(brandedShotUrl(null, a.id), refused("not_found"));
    });
    await check("a public photo is not a video", async () => {
      const a = await shot(open.id, { mediaType: "PHOTO", mediaPath: `m/${open.id}/x.jpg` });
      await assert.rejects(brandedShotUrl(null, a.id), refused("not_video"));
    });
  } finally {
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
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
