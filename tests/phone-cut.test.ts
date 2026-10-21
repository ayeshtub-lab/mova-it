// The phone's cut of a long video to its first 40 s (src/lib/phone-cut.ts), on real files made by
// ffmpeg the way phones make them, each read back by ffmpeg: its length, its orientation, its sound.
// Run: npx tsx tests/phone-cut.test.ts — no network, no database.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg, probeDuration } from "../src/server/ffmpeg";
import { cutFirstSeconds } from "../src/lib/phone-cut";

let dir = "";
let n = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("PASS " + name);
};
const info = (file: string) =>
  ffmpeg(["-i", file, "-f", "null", "-t", "0.1", "-"]);
const picture = ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30"];
const sound = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"];
async function make(name: string, args: string[], seconds = 65) {
  const path = join(dir, name);
  await ffmpeg([...args, "-t", String(seconds), path], 240_000);
  return path;
}
async function cut(path: string, type: string) {
  const bytes = await readFile(path);
  const out = await cutFirstSeconds(new Blob([bytes], { type }));
  if (!out) return null;
  const file = join(dir, `cut-${n}.mp4`);
  await writeFile(file, Buffer.from(await out.arrayBuffer()));
  return { file, size: out.size, from: bytes.length };
}

async function main() {
  dir = await mkdtemp(join(tmpdir(), "zawmo-phone-cut-"));
  try {
    await check(
      "a portrait phone video with sound (H.264, turned 90°): 40 s or just under, still turned, sound kept, smaller",
      async () => {
        const flat = await make("flat.mp4", [
          ...picture,
          ...sound,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-g",
          "30",
          "-c:a",
          "aac",
          "-shortest",
        ]);
        // (Turned the way a phone held upright marks it: a display matrix, the picture untouched.)
        const path = join(dir, "android.mp4");
        await ffmpeg(["-display_rotation", "90", "-i", flat, "-c", "copy", path]);
        assert.match(await info(path), /rotation of -?90/, "the test video isn't turned");
        const out = await cut(path, "video/mp4");
        assert.ok(out, "not cut");
        const seconds = (await probeDuration(out.file))!;
        assert.ok(seconds <= 40 && seconds > 38, `length ${seconds}`);
        const read = await info(out.file);
        assert.match(read, /rotation of -?90/, "orientation lost");
        assert.match(read, /Audio: aac/, "sound lost");
        assert.ok(out.size < out.from * 0.75, `${out.size} of ${out.from}`);
      },
    );
    await check(
      "an iPhone-style video (HEVC in .mov, key frame every 2 s): no frame past 40 s, sound kept",
      async () => {
        const path = await make("iphone.mov", [
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=30",
          ...sound,
          "-c:v",
          "libx265",
          "-preset",
          "ultrafast",
          "-tag:v",
          "hvc1",
          "-x265-params",
          "keyint=60:log-level=error",
          "-c:a",
          "aac",
          "-shortest",
        ], 45);
        const out = await cut(path, "video/quicktime");
        assert.ok(out, "not cut");
        const seconds = (await probeDuration(out.file))!;
        assert.ok(seconds <= 40 && seconds > 37, `length ${seconds}`);
        const read = await info(out.file);
        assert.match(read, /Video: hevc/);
        assert.match(read, /Audio: aac/);
      },
    );
    await check("a video with no sound is cut too", async () => {
      const path = await make("silent.mp4", [
        ...picture,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-g",
        "30",
      ]);
      const out = await cut(path, "video/mp4");
      assert.ok(out);
      assert.ok((await probeDuration(out.file))! <= 40);
    });
    await check(
      "a WebM is left to the server (null), so is something that isn't a video",
      async () => {
        assert.equal(
          await cutFirstSeconds(
            new Blob([new Uint8Array(1000)], { type: "video/webm" }),
          ),
          null,
        );
        assert.equal(
          await cutFirstSeconds(
            new Blob([new Uint8Array(50_000).fill(7)], { type: "video/mp4" }),
          ),
          null,
        );
      },
    );
    await check(
      "too slow → given up (null), for the server to cut",
      async () => {
        // (A phone reading its own file slowly: every read waits.)
        class SlowBlob extends Blob {
          slice(start?: number, end?: number, type?: string): Blob {
            const part = super.slice(start, end, type);
            const read = () => new Promise<void>((done) => setTimeout(done, 50));
            return Object.assign(part, {
              arrayBuffer: () => read().then(() => Blob.prototype.arrayBuffer.call(part)),
              stream: () => {
                const inner = Blob.prototype.stream.call(part).getReader();
                // (in pieces of 256 KB — Node would hand the whole file over at once)
                let left = new Uint8Array(0);
                return new ReadableStream({
                  async pull(controller) {
                    if (!left.length) {
                      const { done, value } = await inner.read();
                      if (done) return controller.close();
                      left = value;
                    }
                    await read();
                    controller.enqueue(left.slice(0, 262_144));
                    left = left.slice(262_144);
                  },
                });
              },
            });
          }
        }
        const slow = new SlowBlob([await readFile(join(dir, "android.mp4"))], { type: "video/mp4" });
        const started = Date.now();
        assert.equal(await cutFirstSeconds(slow, undefined, 1500), null);
        assert.ok(Date.now() - started < 6000, "it waited past its limit");
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`${n} checks`);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
