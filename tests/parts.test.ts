// Unit test for «أجزاء» (src/server/montage/parts.ts): six shots at least, videos as short clips,
// parts of 38 to 40 seconds, a part made early comes as close to 40 as it can; the part's sound fits
// what is in its pictures, and is never an animal (src/server/montage/fill-sounds.ts).
// Run: npx tsx tests/parts.test.ts
import assert from "node:assert/strict";
import { fillPicker } from "../src/server/montage/fill-sounds";
import { nextPart, partLength, shotSeconds, stretch } from "../src/server/montage/parts";

const out: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  out.push("PASS " + name);
};
const shot = (i: number, mediaType: string, durationSec: number | null = null, soundKey: string | null = null) => ({
  id: `s${i}`, contributorId: "u", mediaType, capturedAt: null, uploadedAt: new Date(i * 1000), pickedAt: null, durationSec, soundKey,
});

async function main() {
  await check("a video goes in as a short clip (whole when a part made before is made again); a silent photo a few seconds", async () => {
    assert.equal(await shotSeconds(shot(1, "VIDEO", 23.4)), 6.2);
    assert.equal(await shotSeconds(shot(1, "VIDEO", 4.5)), 4.5);
    assert.equal(await shotSeconds(shot(1, "VIDEO", 23.4), true), 23.4);
    assert.equal(await shotSeconds(shot(1, "PHOTO")), 3.2);
  });
  await check("six shots at least (2026-10-23): five are no part", async () => {
    const five = await nextPart(Array.from({ length: 5 }, (_, i) => shot(i, "VIDEO", 30)));
    assert.equal(five.full, false);
    const six = await nextPart(Array.from({ length: 6 }, (_, i) => shot(i, "VIDEO", 30)));
    assert.equal(six.shots.length, 6);
  });
  await check("long videos share a part as clips, and it never passes 40 seconds", async () => {
    const p = await nextPart(Array.from({ length: 9 }, (_, i) => shot(i, "VIDEO", 35)));
    assert.ok(p.shots.length >= 6);
    assert.equal(p.full, true);
    assert.ok(partLength(p.seconds) <= 40);
  });
  await check("a part made early is stretched toward 40: silent photos up to 8 s, video clips up to 10 s", async () => {
    const shots = [...Array.from({ length: 3 }, (_, i) => shot(i, "PHOTO")), ...Array.from({ length: 3 }, (_, i) => shot(i + 3, "VIDEO", 20))];
    const p = await nextPart(shots);
    assert.equal(p.full, false);
    const s = stretch(p.shots, p.seconds);
    assert.ok(partLength(s) > partLength(p.seconds));
    assert.ok(partLength(s) <= 40.01, String(partLength(s)));
    s.forEach((x, i) => assert.ok(x <= (p.shots[i].mediaType === "VIDEO" ? 10 : 8), String(x)));
  });
  await check("a short video is never stretched past its own end", async () => {
    const shots = [...Array.from({ length: 5 }, (_, i) => shot(i, "PHOTO")), shot(5, "VIDEO", 4)];
    const p = await nextPart(shots);
    const s = stretch(p.shots, p.seconds);
    assert.ok(s[5] <= 4);
  });
  await check("six silent photos made early reach 38 to 40 seconds", async () => {
    const shots = Array.from({ length: 6 }, (_, i) => shot(i, "PHOTO"));
    const p = await nextPart(shots);
    const s = stretch(p.shots, p.seconds);
    assert.ok(partLength(s) >= 38 && partLength(s) <= 40.01, String(partLength(s)));
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
  await check("never an animal or an insect under a film, even when the picture has one (his call, 2026-10-23)", async () => {
    const pick = await fillPicker(false);
    for (const [i, words] of ["خراف بالمرعى #خراف", "قطيع ماعز", "ديك على السور", "بركة ضفادع بالليل", "حلويات بسبوسة"].entries()) {
      const s = await pick({ id: `n${i}`, scene: "other", aiText: words }, "لحظة", null);
      assert.ok(s && !/sheep|goat|rooster|pond|frog|cricket/i.test(s.en), `${words} → ${s?.en}`);
    }
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
