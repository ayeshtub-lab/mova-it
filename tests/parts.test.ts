// Unit test for «أجزاء» (src/server/montage/parts.ts): shots whole, parts of 38 to 40 seconds,
// a part made early comes as close to 40 as its silent photos allow; the sounds of silent photos
// fit what is in them (src/server/montage/fill-sounds.ts).
// Run: npx tsx tests/parts.test.ts
import assert from "node:assert/strict";
import { fillPicker } from "../src/server/montage/fill-sounds";
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
    assert.ok(s.every((x) => x <= 8));
  });
  await check("six silent photos made early reach 38 to 40 seconds", async () => {
    const shots = Array.from({ length: 6 }, (_, i) => shot(i, "PHOTO"));
    const p = await nextPart(shots);
    const s = stretch(p.shots, p.seconds);
    assert.ok(partLength(s) >= 38 && partLength(s) <= 40.01, String(partLength(s)));
  });
  await check("a part closes only from 38 seconds: a 30-second start waits for later shots", async () => {
    const p = await nextPart([shot(1, "VIDEO", 26), shot(2, "VIDEO", 20), shot(3, "VIDEO", 10)]);
    assert.deepEqual(p.shots.map((s) => s.id), ["s1", "s3"]);
    assert.ok(partLength(p.seconds) >= 38 && partLength(p.seconds) <= 40);
  });
  await check("a video with a verse on it counts at the verse's length (never over 40)", async () => {
    const verse = (await import("../src/lib/sounds")).SOUNDS.find((x) => x.cat === "quran" && x.seconds > 20)!;
    assert.ok((await shotSeconds(shot(1, "VIDEO", 10, verse.key))) >= verse.seconds);
  });
  await check("a silent photo's sound fits what is in it", async () => {
    const pick = await fillPicker(false);
    const sea = await pick({ id: "a1", scene: "sea", aiText: "موج البحر #بحر" }, "رحلة", null);
    assert.ok(/gull|wave|sea|water/i.test(sea!.en), sea!.en);
    const fire = await pick({ id: "a2", scene: "other", aiText: "سهرة على نار الحطب" }, "سهرة", null);
    assert.ok(/fire/i.test(fire!.en), fire!.en);
    const wedding = await pick({ id: "a3", scene: "wedding", aiText: "زفة العريس #عرس" }, "عرس", null);
    assert.equal(wedding!.cat, "daf");
    const plain = await pick({ id: "a4", scene: "other", aiText: null }, "يوم عادي", null);
    assert.ok(plain && plain.cat !== "daf" && !/thunder|storm|rain/i.test(plain.en));
  });
  await check("a moment of loss: nature only", async () => {
    const pick = await fillPicker(true);
    const s = await pick({ id: "a5", scene: "wedding", aiText: "عرس" }, "عزاء", null);
    assert.equal(s!.cat, "nature");
  });
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
