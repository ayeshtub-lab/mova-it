// Integration test for the small copies of photos (src/server/small.ts): made once, the
// right size, used by covers, and deleted with the shot.
// Run: npx tsx tests/small.integration.ts — every row and file it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { head, put } from "@vercel/blob";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { deleteAngle } from "../src/server/angles";
import { coverOf } from "../src/server/media";
import { makeSmall } from "../src/server/small";

const TAG = "[smalltest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const exists = (path: string) => head(path).then(() => true, () => false);

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const files: string[] = [];
  try {
    const m = await db.moment.create({ data: { code: `SM${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} m`, visibility: "FRIENDS", creatorId: owner.id } });
    // A noisy 1536×2048 photo, like a phone's (noise keeps the JPEG realistically large).
    const raw = Buffer.alloc(1536 * 2048 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
    const photo = await sharp(raw, { raw: { width: 1536, height: 2048, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    const angle = await db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY" } });
    const mediaPath = `m/${m.id}/${angle.id}.jpg`;
    await put(mediaPath, photo, { access: "private", contentType: "image/jpeg", addRandomSuffix: false });
    files.push(mediaPath);
    await db.angle.update({ where: { id: angle.id }, data: { mediaPath } });

    await check("makes a small copy: short side 540, far lighter than the photo", async () => {
      const made = await makeSmall(angle.id);
      assert.ok(made);
      files.push(made.path);
      assert.equal(made.path, `m/${m.id}/${angle.id}-small.jpg`);
      assert.ok(await exists(made.path));
      const res = await fetch((await coverOf({ mediaType: "PHOTO", mediaPath, thumbPath: null, smallPath: made.path }))!);
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      assert.equal(meta.width, 540);
      assert.equal(meta.height, 720);
      assert.ok(made.bytes * 4 < photo.length, `small ${made.bytes} B vs photo ${photo.length} B`);
      out.push(`     photo ${Math.round(photo.length / 1024)} KB → small ${Math.round(made.bytes / 1024)} KB`);
    });

    await check("covers use the small copy; a second run does nothing", async () => {
      const row = (await db.angle.findUnique({ where: { id: angle.id } }))!;
      assert.ok((await coverOf(row))!.includes("-small.jpg"));
      assert.equal(await makeSmall(angle.id), null);
    });

    await check("videos get none (their poster is already small); covers fall back to it", async () => {
      const v = await db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "VIDEO", status: "READY", mediaPath: "v.mp4", thumbPath: "v-poster.jpg" } });
      assert.equal(await makeSmall(v.id), null);
      assert.ok((await coverOf(v))!.includes("v-poster.jpg"));
    });

    await check("deleting the shot deletes its small copy too", async () => {
      const small = (await db.angle.findUnique({ where: { id: angle.id } }))!.smallPath!;
      await deleteAngle(owner, angle.id);
      assert.ok(!(await exists(small)));
      assert.ok(!(await exists(mediaPath)));
    });
  } finally {
    const { del } = await import("@vercel/blob");
    await Promise.all(files.map((f) => del(f).catch(() => {})));
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
