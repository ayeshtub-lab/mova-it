// Integration test: a big film is made over several runs (src/server/montage/render.ts). Each
// run keeps the pieces it made in Blob and stops once out of time; the next run reuses them;
// the last one joins the film and removes the kept pieces. Uses the TEST Blob store and the test
// database; real ffmpeg. Run: npx tsx tests/montage-pieces.integration.ts — everything it makes
// is removed at the end.
import "./env";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, list, put } from "@vercel/blob";
import { db } from "../src/lib/db";
import { ffmpeg } from "../src/server/ffmpeg";
import { buildMontageVideo, PartialFilm } from "../src/server/montage/render";

const TAG = "[piecestest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const work = await mkdtemp(join(tmpdir(), "piecestest-"));
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const moment = await db.moment.create({ data: { code: `PT${Date.now().toString(36).slice(-4).toUpperCase()}`, title: "اختبار القطع", creatorId: owner.id, visibility: "FRIENDS" } as never });
  const uploaded: string[] = [];
  try {
    // Three short shots: two photos and a video, in the TEST store.
    const media = [];
    for (const [i, kind] of (["PHOTO", "VIDEO", "PHOTO"] as const).entries()) {
      const file = join(work, `m${i}.${kind === "PHOTO" ? "jpg" : "mp4"}`);
      if (kind === "PHOTO") await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=720x960", "-frames:v", "1", file]);
      else await ffmpeg(["-f", "lavfi", "-t", "2", "-i", "testsrc2=size=720x1280:rate=30", "-f", "lavfi", "-t", "2", "-i", "anullsrc=r=44100:cl=stereo", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
      const path = `piecestest/${moment.id}/m${i}.${kind === "PHOTO" ? "jpg" : "mp4"}`;
      await put(path, await readFile(file), { access: "private", addRandomSuffix: false, allowOverwrite: true });
      uploaded.push(path);
      media.push(
        await db.angle.create({
          data: { momentId: moment.id, contributorId: owner.id, mediaType: kind, status: "READY", screening: "allowed", mediaPath: path, durationSec: kind === "VIDEO" ? 2 : null, capturedAt: new Date(Date.now() - (3 - i) * 60_000) },
          include: { contributor: { select: { displayName: true } } },
        }),
      );
    }
    const input = { moment: { id: moment.id, code: moment.code, title: moment.title, kind: "EVERYDAY" }, angles: media, participants: 1, soundKey: "n01", siteHost: "zawmo.com" };
    const kept = async () => (await list({ prefix: `m/${moment.id}/pieces/` })).blobs.length;

    await check("out of time: each run makes one piece more, keeps it, and stops", async () => {
      for (const run of [1, 2]) {
        const dir = await mkdtemp(join(work, `run${run}-`));
        await assert.rejects(buildMontageVideo({ ...input, stopAt: Date.now() - 1 }, dir), (e) => e instanceof PartialFilm && e.done === run && e.total === 3);
        assert.equal(await kept(), run, `run ${run}: ${run} piece(s) kept`);
      }
    });

    await check("the last run reuses the kept pieces, joins the film, and removes them", async () => {
      const dir = await mkdtemp(join(work, "run3-"));
      const film = await buildMontageVideo({ ...input, stopAt: Date.now() - 1 }, dir);
      assert.ok(film.total > 5, `a whole film (${film.total.toFixed(1)} s)`);
      assert.equal(await kept(), 0, "pieces removed");
    });
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
