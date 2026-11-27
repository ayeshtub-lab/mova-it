import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg } from "@/server/ffmpeg";
import { callGemini, screeningEnabled } from "@/server/screening";

// «🎤 احكيها بصوتك» (his idea and «موافق», 27/11): the owner speaks about their shot instead of typing,
// and Gemini writes down what they said. The sound itself is never kept or shown anywhere: it is
// turned into a small mp3 in a temp folder, sent to Gemini, and the folder is removed at once. The
// words go back into the story box; the owner reads them, edits, and saves them like typed words.

export const VOICE_MAX_BYTES = 4 * 1024 * 1024; // a minute from a phone's recorder is far less
export const VOICE_MAX_SECONDS = 60;
const THINK = "low"; // this model refuses «minimal» (400)

// The member's words as they said them, in their own dialect: tidied (punctuation, «إممم», repeats),
// never rewritten, added to or turned into formal Arabic. Phone numbers and links are left out.
const PROMPT = (lang: "ar" | "en") => `Someone on Zawmo, a family photo app, recorded themselves talking about their own photo, instead of typing.
Write down what they said, as the short story under the photo.

Rules:
- Keep THEIR words, in the language and dialect they spoke (Levantine stays Levantine, never turn it into formal Arabic). ${lang === "en" ? "If they spoke English, write English." : ""}
- Only tidy: punctuation, sentence breaks, drop fillers (إممم، آآ، يعني used as filler, um, uh) and accidental repeats.
- Never add facts, words or praise of your own. Never translate. Never summarise.
- Leave out any phone number, link, or account handle they said.
- If there is no clear speech (silence, noise, music only), answer with an empty text. Never guess or invent words you did not clearly hear.

Answer only with JSON: {"text":"<their words, or empty>"}`;

// The recording (whatever the phone made: webm/opus, mp4/aac, ogg…) → mono 16 kHz mp3, at most a
// minute and a bit. null when ffmpeg can't read it or there is almost nothing in it.
async function toMp3(bytes: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "zawmo-voice-"));
  try {
    const input = join(dir, "in");
    const out = join(dir, "a.mp3");
    await writeFile(input, bytes);
    await ffmpeg(["-t", String(VOICE_MAX_SECONDS + 5), "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", out], 30_000);
    const mp3 = await readFile(out);
    if (mp3.length <= 1500) return null;
    // Silence or a faint hum: Gemini, given nothing, has made up a sentence (tested 27/11). Never sent.
    const levels = await ffmpeg(["-i", out, "-af", "volumedetect", "-f", "null", "-"], 20_000);
    const loudest = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(levels)?.[1] ?? "-91");
    const mean = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(levels)?.[1] ?? "-91");
    if (loudest < -35 || mean < -55) return null;
    return mp3.toString("base64");
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const clean = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/https?:\/\/\S+|www\.\S+/gi, "")
        .replace(/[+\d][\d\s-]{7,}\d/g, "")
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, 1000)
    : "";

// "ok" with the words; "unclear" when nothing could be heard; "failed" when Gemini or ffmpeg let us down.
export async function voiceToText(bytes: Buffer, lang: "ar" | "en"): Promise<{ result: "ok"; text: string } | { result: "unclear" | "failed" }> {
  if (!screeningEnabled()) return { result: "failed" };
  const audio = await toMp3(bytes);
  if (!audio) return { result: "unclear" };
  try {
    // Writing down needs little thinking: «low» answered in 2–14 s where the default took ~20
    // (tested 27/11). Should Gemini ever refuse that setting, asked again without it.
    const ask = (think: boolean) =>
      callGemini({
        purpose: "voice-note",
        timeoutMs: 40_000,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: PROMPT(lang) }, { inline_data: { mime_type: "audio/mp3", data: audio } }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", ...(think ? {} : { thinkingConfig: { thinkingLevel: THINK } }) },
        }),
      });
    let res = await ask(false);
    if (res.status === 400) res = await ask(true);
    if (!res.ok) return { result: "failed" };
    const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
    const text = clean((JSON.parse(body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}") as { text?: unknown }).text);
    return text ? { result: "ok", text } : { result: "unclear" };
  } catch {
    return { result: "failed" };
  }
}
