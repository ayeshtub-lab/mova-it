import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { viewUrl } from "@/server/media";
import { ffmpeg } from "@/server/ffmpeg";

// Automatic content check with Gemini, run when an upload completes. Photos are sent
// as they are (already ≤2048 px JPEG); for videos, four frames spread over the clip
// plus the poster. Only clear problems are blocked — everyday life is allowed.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const TIMEOUT_MS = 25_000;

export const screeningEnabled = () => !!process.env.GEMINI_API_KEY;

export type Verdict =
  | { result: "allowed" }
  | { result: "blocked"; category: string; reason: string }
  | { result: "error"; reason: string };

const PROMPT = `You are the content safety check for Zawmo, a social app where friends and family share photos and short videos of everyday moments (gatherings, food, travel, sports, celebrations, nature). Many users are in Arab and Muslim-majority countries.

Decide whether this content may be shown. BLOCK only when it clearly contains:
- sexual: nudity, sexual acts, sexually explicit or provocative content, lingerie/underwear shown sexually;
- minor_safety: any sexualised or exploitative content involving children (always block);
- violence: graphic violence, gore, serious injuries, dead bodies, animal cruelty;
- hate: hate symbols, extremist or terrorist propaganda;
- self_harm: self-harm or suicide shown or encouraged;
- drugs: illegal drug use shown approvingly.

ALLOW everything normal: people and faces, children in ordinary non-sexual situations, swimwear at a beach or pool, sports, crowds, protests without gore, food, pets, cartoons, text and memes without the problems above. When unsure and nothing sexual is involved, allow.

Answer only with JSON: {"verdict":"allow"|"block","category":"none"|"sexual"|"minor_safety"|"violence"|"hate"|"self_harm"|"drugs","reason":"short English reason"}`;

async function jpegBase64(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

// Grab a few small frames straight from the stored video (ffmpeg seeks with HTTP range
// requests, so a long file is not downloaded whole).
async function videoFrames(url: string, durationSec: number | null) {
  const d = durationSec && durationSec > 0 ? durationSec : 10;
  const at = [0.1, 0.35, 0.6, 0.85].map((f) => Math.max(0, d * f));
  const dir = await mkdtemp(join(tmpdir(), "mova-screen-"));
  try {
    const frames = await Promise.all(
      at.map(async (t, i) => {
        const out = join(dir, `f${i}.jpg`);
        await ffmpeg(["-ss", t.toFixed(2), "-i", url, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "5", out], 20_000);
        return (await readFile(out)).toString("base64");
      }),
    );
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function askGemini(imagesBase64: string[]): Promise<Verdict> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT }, ...imagesBase64.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) return { result: "error", reason: `gemini ${res.status}: ${body?.error?.message ?? ""}`.slice(0, 300) };

  // Gemini refusing to even look at the input is itself a strong signal.
  const blockReason = body?.promptFeedback?.blockReason;
  if (blockReason) return { result: "blocked", category: "sexual", reason: `input refused by Gemini (${blockReason})` };
  const candidate = body?.candidates?.[0];
  if (candidate?.finishReason && ["SAFETY", "PROHIBITED_CONTENT", "SPII", "BLOCKLIST"].includes(candidate.finishReason)) {
    return { result: "blocked", category: "sexual", reason: `answer withheld by Gemini (${candidate.finishReason})` };
  }

  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    const parsed = JSON.parse(text) as { verdict?: string; category?: string; reason?: string };
    if (parsed.verdict === "block") {
      return { result: "blocked", category: String(parsed.category ?? "other").slice(0, 40), reason: String(parsed.reason ?? "").slice(0, 300) };
    }
    if (parsed.verdict === "allow") return { result: "allowed" };
  } catch {}
  return { result: "error", reason: `unreadable answer: ${text.slice(0, 200)}` };
}

export async function screenAngle(angle: {
  mediaType: string;
  mediaPath: string | null;
  thumbPath: string | null;
  durationSec: number | null;
}): Promise<Verdict> {
  try {
    const images: string[] = [];
    if (angle.mediaType === "PHOTO") {
      const url = await viewUrl(angle.mediaPath);
      if (!url) return { result: "error", reason: "no media" };
      images.push(await jpegBase64(url));
    } else {
      const [videoUrl, posterUrl] = await Promise.all([viewUrl(angle.mediaPath), viewUrl(angle.thumbPath)]);
      if (posterUrl) images.push(await jpegBase64(posterUrl));
      if (videoUrl) images.push(...(await videoFrames(videoUrl, angle.durationSec).catch(() => [])));
      if (!images.length) return { result: "error", reason: "no frames" };
    }
    return await askGemini(images);
  } catch (error) {
    return { result: "error", reason: String((error as Error)?.message ?? error).slice(0, 300) };
  }
}
