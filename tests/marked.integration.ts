// Integration test for «📤 شارك بختم زاومو» on photos (src/server/marked.ts): a 9:16 JPEG with the
// Zawmo mark is made once and kept; anyone who can see the photo gets it, a visitor only for a
// public moment; a video is refused; a photo with a sound comes as a 9:16 video carrying it, as
// long as the sound (TikTok keeps the sound), made again when the sound changes. Uses the TEST
// Blob store; real ffmpeg; the library sound is fetched from zawmo.com.
// Run: npx tsx tests/marked.integration.ts [save-to.jpg] [save-to.mp4] — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, list, put } from "@vercel/blob";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { soundByKey } from "../src/lib/sounds";
import { ffmpeg } from "../src/server/ffmpeg";
import { MarkedError, markPending, markedPhotoUrl } from "../src/server/marked";

const TAG = "[markedtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} سلمى`, isGuest: false } });
  const stranger = await db.user.create({ data: { displayName: `${TAG} غريب`, isGuest: false } });
  const ids = [owner.id, stranger.id];
  const files: string[] = [];
  try {
    const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#e08a4c" } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><circle cx="600" cy="420" r="220" fill="#ffd27a"/><rect y="700" width="1200" height="200" fill="#2f4a3a"/></svg>') }])
      .jpeg()
      .toBuffer();
    let n = 0;
    const moment = (visibility: string) => db.moment.create({ data: { code: `MK${Date.now().toString(36).slice(-3).toUpperCase()}${n++}`, title: "غروب على السطح", creatorId: owner.id, visibility } as never });
    const shot = async (momentId: string, mediaType = "PHOTO", soundKey: string | null = null) => {
      const path = `markedtest/${Math.random().toString(36).slice(2)}.jpg`;
      await put(path, photo, { access: "private", addRandomSuffix: false, contentType: "image/jpeg" });
      files.push(path);
      return db.angle.create({ data: { momentId, contributorId: owner.id, mediaType, status: "READY", screening: "allowed", mediaPath: path, filter: "auto", soundKey } as never });
    };
    const open = await moment("PUBLIC");
    const friends = await moment("FRIENDS");
    const a = await shot(open.id);
    const f = await shot(friends.id);
    const v = await shot(open.id, "VIDEO");

    await check("a public photo: a 9:16 JPEG with the mark, for a visitor too; made once", async () => {
      const url = await markedPhotoUrl(null, a.id);
      assert.ok(url);
      const res = await fetch(url!);
      assert.equal(res.status, 200);
      const jpg = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(jpg).metadata();
      assert.equal(meta.format, "jpeg");
      assert.equal(meta.width! * 16, meta.height! * 9, `${meta.width}×${meta.height}`);
      if (process.argv[2]) await writeFile(process.argv[2], jpg);
      const kept = (await list({ prefix: `m/${open.id}/` })).blobs.filter((b) => b.pathname.includes("-mark-"));
      assert.equal(kept.length, 1);
      await markedPhotoUrl(stranger, a.id);
      assert.equal((await list({ prefix: `m/${open.id}/` })).blobs.filter((b) => b.pathname.includes("-mark-")).length, 1, "kept, not made again");
    });

    await check("a photo with a sound: a 9:16 video as long as the sound, with it; again when the sound changes", async () => {
      const s = await shot(open.id, "PHOTO", "h03");
      const url = await markedPhotoUrl(null, s.id);
      assert.ok(url);
      const res = await fetch(url!);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "video/mp4");
      const dir = await mkdtemp(join(tmpdir(), "markedtest-"));
      try {
        const file = join(dir, "v.mp4");
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        if (process.argv[3]) await writeFile(process.argv[3], Buffer.from(await (await fetch(url!)).arrayBuffer()));
        const info = await ffmpeg(["-i", file, "-f", "null", "-t", "0", "-"]).catch((e: Error) => e.message);
        const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info)!;
        const seconds = +m[2] * 60 + +m[3];
        assert.ok(Math.abs(seconds - soundByKey("h03")!.seconds) < 0.3, `${seconds} s`);
        assert.ok(seconds <= 40.1);
        assert.match(info, /Stream #.*Audio: aac/);
        const size = /Video: h264.*?(\d{3,4})x(\d{3,4})/.exec(info)!;
        assert.equal(+size[1] * 16, +size[2] * 9, `${size[1]}×${size[2]}`);
        assert.match(info, /Video: h264[^\n]*yuv420p\(tv/, "standard video colours (phones and TikTok)");
        // The sound is really there (not silence).
        const loud = await ffmpeg(["-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
        assert.ok(+/mean_volume: (-?[\d.]+) dB/.exec(loud)![1] > -40, "it has sound");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      await db.angle.update({ where: { id: s.id }, data: { soundKey: "m01" } });
      assert.notEqual(await markedPhotoUrl(null, s.id), url, "a new sound, a new video");
      assert.equal(await markPending(5), 0, "nothing left to make ahead");
    });

    await check("a friends' photo: not for a visitor without an account; a video is refused", async () => {
      // (A signed-in link holder may see a friends' moment's first shot — «give to get» — and so share it.)
      await assert.rejects(markedPhotoUrl(null, f.id), (e) => e instanceof MarkedError && e.code === "not_found");
      assert.ok(await markedPhotoUrl(owner, f.id), "its owner may");
      await assert.rejects(markedPhotoUrl(owner, v.id), (e) => e instanceof MarkedError && e.code === "not_photo");
    });
  } finally {
    const moments = await db.moment.findMany({ where: { creatorId: owner.id }, select: { id: true } });
    for (const m of moments) files.push(...(await list({ prefix: `m/${m.id}/` })).blobs.map((b) => b.pathname));
    await Promise.all(files.map((p) => del(p).catch(() => {})));
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
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
