// A video's cover drawn black by the phone (src/server/angles.ts blackFrame, 2026-10-24): a flat
// black frame is caught; a dark night picture, or a normal one, is not.
// Run: npx tsx tests/black-cover.test.ts
import "./env";
import assert from "node:assert/strict";
import sharp from "sharp";
import { blackFrame } from "../src/server/angles";

let n = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("PASS " + name);
};
const jpeg = (raw: Buffer, w: number, h: number) => sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();

async function main() {
  await check("a flat black frame", async () => {
    assert.equal(await blackFrame(await jpeg(Buffer.alloc(64 * 64 * 3, 0), 64, 64)), true);
  });
  await check("a dark night with a few lights is not black", async () => {
    const raw = Buffer.alloc(64 * 64 * 3, 4);
    for (let i = 0; i < 40; i++) raw.fill(230, (i * 97 % 4096) * 3, (i * 97 % 4096) * 3 + 3);
    assert.equal(await blackFrame(await jpeg(raw, 64, 64)), false);
  });
  await check("a normal picture is not black", async () => {
    assert.equal(await blackFrame(await jpeg(Buffer.alloc(64 * 64 * 3, 120), 64, 64)), false);
  });
  console.log(`${n} checks`);
}
main().catch((e) => {
  console.log("FAIL", e);
  process.exit(1);
});
