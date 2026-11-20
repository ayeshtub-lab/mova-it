import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { namedSurah, normalizeArabic, plainName, startVerse, verseRange, versesWithin, type Timing, type Verse } from "@/lib/quran-match";
import { brandAfterChange } from "@/server/branded";
import { ffmpeg } from "@/server/ffmpeg";
import { refreshMontageForAngle } from "@/server/montage";
import { callGemini, screeningEnabled } from "@/server/screening";

// «📖 سور من القرآن» (his 20/11): a photo of a Quran page by Zawmo's own account gets the verses its
// story («📝 حكايات الصور») quotes, recited by Sheikh Mishary Alafasy — from the first verse quoted, whole
// verses up to 40 seconds (fewer when the surah ends), never a verse cut. Made when the story is saved.
//  • which verse: the story's own words matched to the Quran's text (src/lib/quran-match.ts) — not a
//    number typed in it, nor a guess from the picture;
//  • the sound: MP3Quran.net's recitation (its rights open to all, as the library's verses —
//    src/lib/sounds.ts), cut on its official verse timings, read straight from its file (only the
//    part needed is fetched);
//  • then Gemini listens: it must hear these verses' first words, or nothing is put on the photo.
// It becomes the photo's sound as a Zawmo sound in «قرآن» (a UserSound tied to the photo, «🔒 خاص» so it never
// fills other montages nor the «🎤 من الناس» list: heard whole,
// never looped), replaced when the story changes to other verses. A sound its owner picked
// themselves is never replaced.

const TEXT_URL = "https://api.alquran.cloud/v1/quran/quran-simple-clean"; // Tanzil's text
const READ = 123; // Alafasy, Hafs — MP3Quran's verse timings
const AUDIO = (surah: number) => `https://cdn.mp3quran.net/audio/mishary-alafasy/r1/${String(surah).padStart(3, "0")}.mp3`;
const TIMINGS = (surah: number) => `https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${READ}`;
const READER = "العفاسي";

type Quran = { verses: Verse[]; names: { surah: number; name: string }[] };
let quran: Promise<Quran> | null = null;
function loadQuran() {
  quran ??= (async () => {
    const res = await fetch(TEXT_URL, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`quran text ${res.status}`);
    const body = (await res.json()) as { data: { surahs: { number: number; name: string; ayahs: { numberInSurah: number; text: string }[] }[] } };
    const surahs = body.data.surahs;
    if (surahs.length !== 114) throw new Error("quran text incomplete");
    return {
      verses: surahs.flatMap((s) => s.ayahs.map((a) => ({ surah: s.number, ayah: a.numberInSurah, text: a.text }))),
      names: surahs.map((s) => ({ surah: s.number, name: s.name })),
    };
  })().catch((error) => {
    quran = null; // tried again next time
    throw error;
  });
  return quran;
}

async function timings(surah: number): Promise<Timing[]> {
  const res = await fetch(TIMINGS(surah), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`timings ${res.status}`);
  const rows = (await res.json()) as { ayah: number; start_time: number; end_time: number }[];
  return rows.filter((r) => r.ayah > 0 && r.end_time > r.start_time).map((r) => ({ ayah: r.ayah, start: r.start_time, end: r.end_time }));
}

async function cut(surah: number, startMs: number, endMs: number) {
  const dir = await mkdtemp(join(tmpdir(), "zawmo-quran-"));
  try {
    const out = join(dir, "recite.mp3");
    const length = (endMs - startMs) / 1000;
    await ffmpeg(["-ss", (startMs / 1000).toFixed(3), "-i", AUDIO(surah), "-t", length.toFixed(3), "-vn", "-ac", "2", "-ar", "44100", "-b:a", "128k", "-af", `afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, length - 0.25).toFixed(2)}:d=0.25`, out], 90_000);
    const mp3 = await readFile(out);
    if (mp3.length < 8000) throw new Error("recitation too short");
    return { mp3, seconds: Math.round(length * 10) / 10 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Gemini hears the cut: Quran recited, starting with these words. Anything else (or no answer) → no.
async function heardRight(mp3: Buffer, first: Verse) {
  if (!screeningEnabled()) return false;
  const words = normalizeArabic(first.text).split(" ").slice(0, 8).join(" ");
  const prompt = `You hear a short audio clip. It should be a Quran recitation starting with verse ${first.ayah} of surah ${first.surah}, whose first words are: «${words}».
Answer only JSON: {"quran":true|false,"startsRight":true|false,"heard":"<the first few Arabic words you hear>"}
- quran: it is the Quran being recited.
- startsRight: the recitation begins with those words (an opening «أعوذ بالله…» or «بسم الله…» before them is fine).`;
  const res = await callGemini({
    purpose: "quran",
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "audio/mp3", data: mp3.toString("base64") } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  }).catch(() => null);
  if (!res?.ok) return false;
  const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  try {
    const parsed = JSON.parse(body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "") as { quran?: boolean; startsRight?: boolean };
    return parsed.quran === true && parsed.startsRight === true;
  } catch {
    return false;
  }
}

export type ReciteResult = "made" | "same" | "not_quran" | "not_found" | "skipped" | "unheard";

// The verses a story quotes, as their name («البقرة ٢٧٠ · العفاسي») and where they are in the surah's file.
export async function planRecitation(note: string) {
  const { verses, names } = await loadQuran();
  const surah = namedSurah(note, names);
  const first = startVerse(note, surah ? verses.filter((v) => v.surah === surah) : verses);
  if (!first) return null;
  const span = versesWithin(await timings(first.surah), first.ayah);
  if (!span) return null;
  const name = `${plainName(names[first.surah - 1].name)} ${verseRange(span.from, span.to)} · ${READER}`.slice(0, 40);
  return { first, span, name };
}

// …cut, and heard by Gemini. null: not confirmed.
export async function recordRecitation(plan: NonNullable<Awaited<ReturnType<typeof planRecitation>>>) {
  const made = await cut(plan.first.surah, plan.span.start, plan.span.end);
  return (await heardRight(made.mp3, plan.first)) ? made : null;
}

// Run after a photo's story is saved. Never throws: a recitation that can't be made leaves the photo as it was.
export async function reciteFromNote(angleId: string, host: string): Promise<ReciteResult> {
  try {
    const angle = await db.angle.findUnique({
      where: { id: angleId },
      select: { id: true, mediaType: true, note: true, soundKey: true, contributorId: true, contributor: { select: { isAdmin: true } } },
    });
    // Zawmo's own accounts only, for now: a verse put wrong is not a typo.
    if (!angle || angle.mediaType !== "PHOTO" || !angle.contributor.isAdmin || !angle.note) return "skipped";
    if (!/سور[ةه]/.test(angle.note)) return "not_quran";
    const mine = await db.userSound.findUnique({ where: { angleId: angle.id }, select: { id: true, key: true, name: true, path: true, status: true } });
    // A sound its owner picked — or their taking the recitation off — stays.
    if (mine ? angle.soundKey !== mine.key : !!angle.soundKey) return "skipped";

    const plan = await planRecitation(angle.note);
    if (!plan) return "not_found";
    const { name } = plan;
    if (mine?.status === "public" && mine.name === name) return "same";
    const made = await recordRecitation(plan);
    if (!made) {
      console.error("quran recitation not confirmed", angleId, name);
      return "unheard";
    }
    const { mp3, seconds } = made;
    const key = `u${randomBytes(6).toString("hex")}`;
    const path = `sounds/u/${key}.mp3`;
    await put(path, mp3, { access: "private", contentType: "audio/mpeg", addRandomSuffix: false, allowOverwrite: true });
    // The one it replaces is let go (its file too), then the new one is the photo's.
    if (mine) {
      await db.userSound.update({ where: { id: mine.id }, data: { status: "withdrawn", path: null, angleId: null } });
      if (mine.path) await del(mine.path).catch(() => {});
    }
    await db.userSound.create({ data: { key, ownerId: angle.contributorId, angleId: angle.id, name, seconds, path, status: "public", category: "quran", shared: false } });
    await db.angle.update({ where: { id: angle.id }, data: { soundKey: key, muteOriginal: false } });
    // Its moment's video and its shared video, with the recitation.
    await refreshMontageForAngle(angle.id, host).catch((error) => console.error("montage refresh failed", angleId, error));
    await brandAfterChange(angle.id);
    return "made";
  } catch (error) {
    console.error("quran recitation failed", angleId, error);
    return "skipped";
  }
}
