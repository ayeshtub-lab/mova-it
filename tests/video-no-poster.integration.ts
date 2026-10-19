// Integration test for a video whose phone couldn't prepare it fully (2026-10-19: Android phones
// never loading a video's details spun on «تجهيز» for ever): it goes up without its length or
// cover — the server measures it, makes its cover from the video, and keeps the first 40 seconds
// of a longer one rather than refusing it (src/server/angles.ts prepareAngle / completeAngle).
// Run: npx tsx tests/video-no-poster.integration.ts — every row and file it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, head, put } from "@vercel/blob";
import { db } from "../src/lib/db";
import { completeAngle, prepareAngle } from "../src/server/angles";
import { ffmpeg } from "../src/server/ffmpeg";

const TAG = "[noposter]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const work = await mkdtemp(join(tmpdir(), "noposter-"));
  const files: string[] = [];
  try {
    const m = await db.moment.create({ data: { code: `NP${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} m`, visibility: "FRIENDS", creatorId: owner.id } });
    await db.participant.create({ data: { momentId: m.id, userId: owner.id, role: "HOST" } });
    const video = async (seconds: number) => {
      const file = join(work, `v${seconds}.mp4`);
      await ffmpeg(["-y", "-f", "lavfi", "-t", String(seconds), "-i", "testsrc2=size=360x640:rate=15", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file]);
      return readFile(file);
    };
    const upload = async (seconds: number) => {
      // No durationSec, no poster: as the phone sends it when it couldn't read the video.
      const { angleId, mediaPath, thumbPath } = (await prepareAngle(owner, { code: m.code, mediaType: "VIDEO", contentType: "video/mp4" })) as unknown as { angleId: string; mediaPath: string; thumbPath: string };
      await put(mediaPath, await video(seconds), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
      files.push(mediaPath, thumbPath);
      return { angleId, thumbPath };
    };

    await check("a video without its length or cover goes up: the server makes the cover and measures it", async () => {
      const { angleId, thumbPath } = await upload(3);
      const done = await completeAngle(owner, angleId);
      assert.notEqual(done.status, "PROCESSING");
      assert.ok((await head(thumbPath)).size > 1000, "cover made on the server");
      const row = await db.angle.findUnique({ where: { id: angleId } });
      assert.ok(row?.durationSec && Math.abs(row.durationSec - 3) < 0.6, `measured ${row?.durationSec}`);
    });
    await check("…and one longer than 40 s keeps its first 40 instead of being refused", async () => {
      const { angleId } = await upload(44);
      await completeAngle(owner, angleId);
      const row = await db.angle.findUnique({ where: { id: angleId } });
      assert.ok(row?.mediaPath);
      files.push(row!.mediaPath!);
      assert.ok(row?.durationSec && row.durationSec <= 40.6, `kept ${row?.durationSec}`);
    });
  } finally {
    await Promise.all(files.map((f) => del(f).catch(() => {})));
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } });
    await rm(work, { recursive: true, force: true });
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
