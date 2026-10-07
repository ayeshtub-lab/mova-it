// Integration test: a film of many shots (src/server/montage/render.ts, joinInRuns) is joined a
// few segments at a time, then the runs together — so memory stays small (15+ shots in one
// ffmpeg ran the server out of memory, 2026-10-07). The film is whole: as long as it says, with
// its sound, a verse under it held to its end. Uses the TEST Blob store and test database; real
// ffmpeg. Run: npx tsx tests/montage-many.integration.ts [save-to.mp4] — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, list, put } from "@vercel/blob";
import { db } from "../src/lib/db";
import { soundByKey } from "../src/lib/sounds";
import { ffmpeg } from "../src/server/ffmpeg";
import { buildMontageVideo } from "../src/server/montage/render";

const TAG = "[manytest]";
const SHOTS = 16;
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const work = await mkdtemp(join(tmpdir(), "manytest-"));
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const moment = await db.moment.create({ data: { code: `MN${Date.now().toString(36).slice(-4).toUpperCase()}`, title: "لحظة كثيرة اللقطات", creatorId: owner.id, visibility: "FRIENDS" } as never });
  const uploaded: string[] = [];
  try {
    const media: Parameters<typeof buildMontageVideo>[0]["angles"] = [];
    for (let i = 0; i < SHOTS; i++) {
      const video = i === 7;
      const file = join(work, `m${i}.${video ? "mp4" : "jpg"}`);
      if (video) await ffmpeg(["-f", "lavfi", "-t", "3", "-i", "testsrc2=size=720x1280:rate=30", "-f", "lavfi", "-t", "3", "-i", "sine=f=440:r=44100", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
      else await ffmpeg(["-f", "lavfi", "-i", `testsrc2=size=720x960`, "-vf", `hue=h=${i * 22}`, "-frames:v", "1", file]);
      const path = `manytest/${moment.id}/m${i}.${video ? "mp4" : "jpg"}`;
      await put(path, await readFile(file), { access: "private", addRandomSuffix: false, allowOverwrite: true });
      uploaded.push(path);
      media.push(
        await db.angle.create({
          data: { momentId: moment.id, contributorId: owner.id, mediaType: video ? "VIDEO" : "PHOTO", status: "READY", screening: "allowed", mediaPath: path, durationSec: video ? 3 : null, capturedAt: new Date(Date.now() - (SHOTS - i) * 60_000) },
          include: { contributor: { select: { displayName: true } } },
        }),
      );
    }

    for (const soundKey of ["q16", "n01"]) {
      await check(`${SHOTS} shots under ${soundKey}: joined in runs, the film whole and as long as it says`, async () => {
        const dir = await mkdtemp(join(work, `${soundKey}-`));
        const started = Date.now();
        const film = await buildMontageVideo({ moment: { id: moment.id, code: moment.code, title: moment.title, kind: "EVERYDAY" }, angles: media, participants: 1, soundKey, siteHost: "zawmo.com" }, dir);
        const runs = (await readdir(dir)).filter((f) => f.startsWith("run-"));
        assert.ok(runs.length >= 3, `joined in runs (${runs.join(", ")})`);
        const info = await ffmpeg(["-i", film.output, "-f", "null", "-t", "0", "-"]).catch((e: Error) => e.message);
        const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info)!;
        const seconds = +m[2] * 60 + +m[3];
        assert.ok(Math.abs(seconds - film.total) < 0.3, `file ${seconds} s, film ${film.total.toFixed(2)} s`);
        assert.match(info, /Stream #.*Audio: aac/);
        const sound = soundByKey(soundKey)!;
        if (soundKey.startsWith("q")) assert.ok(film.total >= sound.seconds + 0.5, "the verse is heard to its end");
        // Every second of the film has a picture that moves on (no frozen or black stretch mid-film).
        const black = await ffmpeg(["-i", film.output, "-vf", "blackdetect=d=0.5:pix_th=0.05", "-an", "-f", "null", "-"]);
        assert.ok(!/black_start/.test(black), "no black stretch");
        if (process.argv[2] && soundKey === "q16") await copyFile(film.output, process.argv[2]);
        out.push(`  (${((Date.now() - started) / 1000).toFixed(0)} s to make ${film.total.toFixed(1)} s of film)`);
      });
    }
  } finally {
    const left = (await list({ prefix: `m/${moment.id}/` })).blobs.map((b) => b.pathname);
    await Promise.all([...uploaded, ...left].map((p) => del(p).catch(() => {})));
    await db.angle.deleteMany({ where: { momentId: moment.id } });
    await db.moment.delete({ where: { id: moment.id } });
    await db.user.delete({ where: { id: owner.id } });
    await rm(work, { recursive: true, force: true });
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
