// Unit test for the server's own video-length check (probeDuration in src/server/ffmpeg.ts):
// the phone's claim is not trusted. Run: npx tsx tests/probe.test.ts — needs ffmpeg locally.
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { ffmpeg, probeDuration } from "../src/server/ffmpeg";

async function main() {
  mkdirSync("tests/.tmp", { recursive: true });
  const make = async (s: number) => {
    const out = `tests/.tmp/probe-${s}.mp4`;
    await ffmpeg(["-f", "lavfi", "-i", `testsrc=size=160x120:rate=10:duration=${s}`, "-pix_fmt", "yuv420p", out], 60000);
    return out;
  };
  try {
    assert.equal(await probeDuration(await make(5)), 5);
    assert.equal(await probeDuration(await make(45)), 45, "a 45-second video is caught, whatever the phone said");
    assert.equal(await probeDuration("tests/.tmp/missing.mp4"), null);
    console.log("PASS the server measures a video's real length (5 s, 45 s, unreadable → null)");
  } finally {
    rmSync("tests/.tmp/probe-5.mp4", { force: true });
    rmSync("tests/.tmp/probe-45.mp4", { force: true });
  }
}
main();
