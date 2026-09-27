// Integration test for writing on shots (src/server/caption.ts): who may, what is
// accepted, and that its image never outlives the writing or the shot.
// Run: npx tsx tests/caption.integration.ts — every row and file it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { head } from "@vercel/blob";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { parseCaption } from "../src/lib/caption";
import { deleteAngle } from "../src/server/angles";
import { CaptionError, clearCaption, setCaption } from "../src/server/caption";

const TAG = "[captest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const exists = (path: string) => head(path).then(() => true, () => false);

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [owner, other] = await Promise.all([mk("owner"), mk("other")]);
  const ids = [owner.id, other.id];
  const png = await sharp({ create: { width: 400, height: 120, channels: 4, background: { r: 255, g: 191, b: 31, alpha: 1 } } }).png().toBuffer();
  const files: string[] = [];
  try {
    const m = await db.moment.create({ data: { code: `CP${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} m`, visibility: "FRIENDS", creatorId: owner.id } });
    const angle = await db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", mediaPath: "x" } });
    const good = { text: "يا سلام 😍", y: "0.3", w: "0.4", style: JSON.stringify({ colour: "#ffbf1f", pill: true, size: 2 }) };

    await check("only the shot's owner writes on it", async () => {
      await assert.rejects(setCaption(other, angle.id, png, good), (e) => e instanceof CaptionError && e.code === "forbidden");
    });

    await check("refuses what isn't a small PNG, empty or too long text, and a place off the frame", async () => {
      const jpeg = await sharp(png).jpeg().toBuffer();
      const huge = await sharp({ create: { width: 1200, height: 100, channels: 4, background: "#fff" } }).png().toBuffer();
      for (const [image, raw] of [
        [jpeg, good],
        [huge, good],
        [png, { ...good, text: "   " }],
        [png, { ...good, text: "ا".repeat(121) }],
        [png, { ...good, y: "0.99" }],
        [png, { ...good, w: "0" }],
      ] as const) {
        await assert.rejects(setCaption(owner, angle.id, image, raw), (e) => e instanceof CaptionError && e.code === "invalid");
      }
    });

    await check("saves text, place and style; replacing it removes the old image", async () => {
      const first = await setCaption(owner, angle.id, png, good);
      assert.equal(first?.text, "يا سلام 😍");
      assert.deepEqual(first?.style, { colour: "#ffbf1f", pill: true, size: 2 });
      const one = parseCaption((await db.angle.findUnique({ where: { id: angle.id } }))!.caption)!;
      files.push(one.path);
      assert.equal(one.y, 0.3);
      assert.ok(await exists(one.path), "image stored");
      await setCaption(owner, angle.id, png, { ...good, text: "ثاني" });
      const two = parseCaption((await db.angle.findUnique({ where: { id: angle.id } }))!.caption)!;
      files.push(two.path);
      assert.notEqual(two.path, one.path);
      assert.ok(!(await exists(one.path)), "old image removed");
    });

    await check("removing the writing removes its image", async () => {
      const path = parseCaption((await db.angle.findUnique({ where: { id: angle.id } }))!.caption)!.path;
      await clearCaption(owner, angle.id);
      assert.equal((await db.angle.findUnique({ where: { id: angle.id } }))!.caption, null);
      assert.ok(!(await exists(path)));
    });

    await check("deleting the shot deletes its writing's image too", async () => {
      await setCaption(owner, angle.id, png, good);
      const path = parseCaption((await db.angle.findUnique({ where: { id: angle.id } }))!.caption)!.path;
      files.push(path);
      await deleteAngle(owner, angle.id);
      assert.ok(!(await exists(path)));
    });
  } finally {
    const { del } = await import("@vercel/blob");
    await Promise.all(files.map((f) => del(f).catch(() => {})));
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
