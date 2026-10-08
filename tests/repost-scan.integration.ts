// Integration test: older shots are looked at once more for «clearly someone else's»
// (src/server/repost-scan.ts) — a photo with another app's watermark becomes «repost» and is
// filed for an admin; an ordinary one stays as it was (only marked as looked at). Real Gemini
// (skipped without GEMINI_API_KEY); TEST Blob store and database.
// Run: GEMINI_ENV=<file with GEMINI_API_KEY> npx tsx tests/repost-scan.integration.ts
import "./env";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { rescanReposts } from "../src/server/repost-scan";

if (process.env.GEMINI_ENV) config({ path: process.env.GEMINI_ENV, override: true });
const TAG = "[rescantest]";
const out: string[] = [];

async function main() {
  if (!process.env.GEMINI_API_KEY) return console.log("SKIP (no GEMINI_API_KEY)");
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const files: string[] = [];
  try {
    const moment = await db.moment.create({ data: { code: `RS${Date.now().toString(36).slice(-4).toUpperCase()}`, title: "قهوة", creatorId: owner.id, visibility: "PUBLIC" } as never });
    const base = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#7a5233" } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect y="700" width="900" height="500" fill="#3c6e47"/><ellipse cx="450" cy="640" rx="190" ry="60" fill="#f2efe8"/><rect x="290" y="480" width="320" height="170" rx="30" fill="#f2efe8"/><ellipse cx="450" cy="490" rx="160" ry="35" fill="#4a2c17"/></svg>') }])
      .jpeg()
      .toBuffer();
    const watermarked = await sharp(base)
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><g fill="#fff" font-family="Arial" font-weight="bold" opacity="0.85"><text x="40" y="120" font-size="64">♪ TikTok</text><text x="40" y="180" font-size="40">@coffee_daily_77</text></g></svg>') }])
      .jpeg()
      .toBuffer();
    const shot = async (name: string, jpg: Buffer) => {
      const path = `rescantest/${moment.id}/${name}.jpg`;
      await put(path, jpg, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/jpeg" });
      files.push(path);
      return db.angle.create({ data: { momentId: moment.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", screenedAt: new Date("2026-10-01T00:00:00Z"), mediaPath: path } as never });
    };
    const plain = await shot("plain", base);
    const copied = await shot("copied", watermarked);

    const done = await rescanReposts(2);
    assert.equal(done.checked, 2, JSON.stringify(done));
    const [p, c] = await Promise.all([db.angle.findUniqueOrThrow({ where: { id: plain.id } }), db.angle.findUniqueOrThrow({ where: { id: copied.id } })]);
    assert.equal(c.screening, "repost", "the watermarked one");
    assert.equal(p.screening, "allowed", "the ordinary one untouched");
    assert.ok(p.screenedAt! > new Date("2026-10-08T07:45:00Z"), "marked as looked at");
    assert.equal(await db.report.count({ where: { angleId: copied.id, reason: "REPOST" } }), 1);
    out.push("PASS an older shot with another app's watermark becomes «repost»; an ordinary one stays");
    const left = await db.angle.count({ where: { id: { in: [plain.id, copied.id] }, screenedAt: { lt: new Date("2026-10-08T07:45:00Z") } } });
    assert.equal(left, 0, "neither is in the queue any more");
    out.push("PASS each shot is looked at once");
  } finally {
    await Promise.all(files.map((f) => del(f).catch(() => {})));
    await db.report.deleteMany({ where: { moment: { creatorId: owner.id } } });
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    out.push((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left users");
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
