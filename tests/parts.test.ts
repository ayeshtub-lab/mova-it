// Unit test for «أجزاء» (src/server/montage/parts.ts): shots whole, parts of up to 40 seconds,
// a part made early comes as close to 40 as its silent photos allow.
// Run: npx tsx tests/parts.test.ts
import assert from "node:assert/strict";
import { nextPart, partLength, shotSeconds, stretch, withCards } from "../src/server/montage/parts";

const out: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  out.push("PASS " + name);
};
const shot = (i: number, mediaType: string, durationSec: number | null = null, soundKey: string | null = null) => ({
  id: `s${i}`, contributorId: "u", mediaType, capturedAt: null, uploadedAt: new Date(i * 1000), pickedAt: null, durationSec, soundKey,
});

async function main() {
  await check("a video stays whole; a silent photo a few seconds", async () => {
    assert.equal(await shotSeconds(shot(1, "VIDEO", 23.4)), 23.4);
    assert.equal(await shotSeconds(shot(1, "PHOTO")), 3.2);
  });
  await check("a part never passes 40 seconds; the rest waits for the next part", async () => {
    const shots = [shot(1, "VIDEO", 20), shot(2, "VIDEO", 15), shot(3, "VIDEO", 10)];
    const p = await nextPart(shots);
    assert.deepEqual(p.shots.map((s) => s.id), ["s1", "s2"]);
    assert.equal(p.full, true);
    assert.ok(partLength(p.seconds) <= 40);
  });
  await check("a shot longer than a part makes a part of its own", async () => {
    const p = await nextPart([shot(1, "VIDEO", 39.9), shot(2, "PHOTO")]);
    assert.deepEqual(p.shots.map((s) => s.id), ["s1"]);
  });
  await check("a 39.9-second video makes a part of its own: no cards, never over 40", async () => {
    const p = await nextPart([shot(1, "VIDEO", 39.9)]);
    assert.equal(withCards(p.seconds), false);
    assert.ok(partLength(p.seconds) <= 40);
    assert.equal(p.full, true);
  });
  await check("a photo is never closed into a part of its own by the long video after it", async () => {
    const p = await nextPart([shot(1, "PHOTO"), shot(2, "VIDEO", 39.9), shot(3, "PHOTO")]);
    assert.deepEqual(p.shots.map((s) => s.id), ["s1", "s3"]);
    assert.equal(p.full, false);
  });
  await check("a part made early is stretched toward 40 with its silent photos", async () => {
    const shots = Array.from({ length: 6 }, (_, i) => shot(i, "PHOTO"));
    const p = await nextPart(shots);
    assert.equal(p.full, false);
    const s = stretch(p.shots, p.seconds);
    assert.ok(partLength(s) > partLength(p.seconds));
    assert.ok(partLength(s) <= 40.01);
    assert.ok(s.every((x) => x <= 5));
  });
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
