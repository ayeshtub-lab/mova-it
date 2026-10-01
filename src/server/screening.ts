import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as Sentry from "@sentry/nextjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { viewUrl } from "@/server/media";
import { ffmpeg } from "@/server/ffmpeg";
import { isScene, SCENES, type Scene } from "@/lib/scenes";

// Automatic content check with Gemini, run when an upload completes. Photos are sent
// as they are (already ≤2048 px JPEG); for videos, four frames spread over the clip
// plus the poster. Only clear problems are blocked — everyday life is allowed.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const TIMEOUT_MS = 25_000;

// Gemini now and then answers "busy" (503), "too many" (429) or a passing server error. Try
// again twice, a little later each time, before giving up: a public shot left unchecked is
// hidden until an admin looks at it.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
export const RETRY_DELAYS_MS = [1500, 4500];
export async function callGemini({ body }: { body: string }) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body,
    });
    if (res.ok || !RETRY_STATUS.has(res.status) || attempt >= RETRY_DELAYS_MS.length) return res;
    await res.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

export const screeningEnabled = () => !!process.env.GEMINI_API_KEY;

// Gemini failing (a retired model name, a bad key, an outage) must never go unnoticed: uploads
// keep working, but checks and «صوّر معك» quietly stop. So every failure is reported to error
// monitoring (grouped by where and status), where the on-call check picks it up.
function reportGemini(where: "screening" | "text" | "lens", detail: string) {
  console.error(`gemini ${where} failed`, detail);
  Sentry.captureMessage(`Gemini ${where} failed: ${detail.slice(0, 120)}`, { level: "error", fingerprint: ["gemini", where, detail.slice(0, 40)] });
}

export type Verdict =
  | { result: "allowed"; scene?: Scene; seen?: string; title?: string; text?: string }
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

Also name the main scene, one of: ${Object.keys(SCENES).join(", ")} ("sky" = the moon, stars or a striking sky; "gathering" = family or friends together; "other" when none fits clearly).

Also, like a lens: copy any clearly readable name shown (a shop or restaurant sign, a venue, a team, an event banner) exactly as written, and name a recognisable landmark or venue if there is one. Leave them empty when there is none — never guess.

Also suggest a name for this moment in Arabic, 2 to 4 words, the way the person who shot it would title it for friends (for example «عنب الدالية», «غروب على البحر», «عشاء العيلة»). Plain words only: no emoji, no hashtags, no quotation marks.

Answer only with JSON: {"verdict":"allow"|"block","category":"none"|"sexual"|"minor_safety"|"violence"|"hate"|"self_harm"|"drugs","reason":"short English reason","scene":"<one of the scenes>","text":"<visible names, or empty>","landmark":"<landmark or venue, or empty>","title":"<the suggested Arabic name>"}`;

// Pictures only (not text): a line about the shot, for search engines and for a moment left
// without a description.
const DESCRIBE = `

Also write, in Arabic, a description of this shot for its public page: one warm, natural sentence (8 to 16 words) that says concretely what is seen — the place, food, occasion, weather or mood — the way a happy friend would caption it, so that someone searching for such a picture would find it. Never name or guess who the people are, never invent a city or country that is not clearly shown, no emoji, no quotation marks. Then 2 or 3 hashtags in Arabic that people really search for about what is seen (single words or joined with _, no spaces, for example غروب, قهوة_الصباح, عرس).

Add them to the same JSON: "description":"<the sentence>","hashtags":["<tag>","<tag>"]`;

// The description and its hashtags as one line (≤150, a moment description's limit).
export function aiTextOf(description: unknown, hashtags: unknown) {
  const line = typeof description === "string" ? description.replace(/[#"«»\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 110) : "";
  if (!line) return "";
  const tags = (Array.isArray(hashtags) ? hashtags : [])
    .map((t) => (typeof t === "string" ? t.replace(/^#+/, "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 30) : ""))
    .filter(Boolean);
  let out = line;
  for (const t of [...new Set(tags)].slice(0, 3)) if (`${out} #${t}`.length <= 150) out += ` #${t}`;
  return out;
}

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
  const res = await callGemini({
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT + DESCRIBE }, ...imagesBase64.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    reportGemini("screening", `${res.status} ${body?.error?.message ?? ""} (model ${MODEL})`);
    return { result: "error", reason: `gemini ${res.status}: ${body?.error?.message ?? ""}`.slice(0, 300) };
  }

  // Gemini refusing to even look at the input is itself a strong signal.
  const blockReason = body?.promptFeedback?.blockReason;
  if (blockReason) return { result: "blocked", category: "sexual", reason: `input refused by Gemini (${blockReason})` };
  const candidate = body?.candidates?.[0];
  if (candidate?.finishReason && ["SAFETY", "PROHIBITED_CONTENT", "SPII", "BLOCKLIST"].includes(candidate.finishReason)) {
    return { result: "blocked", category: "sexual", reason: `answer withheld by Gemini (${candidate.finishReason})` };
  }

  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    const parsed = JSON.parse(text) as { verdict?: string; category?: string; reason?: string; scene?: string; text?: string; landmark?: string; title?: string; description?: unknown; hashtags?: unknown };
    if (parsed.verdict === "block") {
      return { result: "blocked", category: String(parsed.category ?? "other").slice(0, 40), reason: String(parsed.reason ?? "").slice(0, 300) };
    }
    if (parsed.verdict === "allow") {
      // What the "lens" read (signs, venue, landmark): matched between shots by «صوّر معك».
      const seen = [parsed.text, parsed.landmark].filter((x) => typeof x === "string" && x.trim()).join(" · ").slice(0, 160);
      // A name to offer when the moment was started without one (the creator may change it).
      const title = typeof parsed.title === "string" ? parsed.title.replace(/["«»#]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
      const described = aiTextOf(parsed.description, parsed.hashtags);
      return { result: "allowed", ...(isScene(parsed.scene) ? { scene: parsed.scene } : {}), ...(seen ? { seen } : {}), ...(title ? { title } : {}), ...(described ? { text: described } : {}) };
    }
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

// A short text shown to everyone (a public moment's description): same rules, as text.
export async function screenText(text: string): Promise<Verdict> {
  if (!screeningEnabled()) return { result: "error", reason: "screening off" };
  try {
    const res = await callGemini({
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${PROMPT}\n\nThe content is not an image but this short text (it may be Arabic, any dialect). Also BLOCK insults, harassment of a named person, and ads or spam links; allow ordinary words and hashtags.\n\nTEXT:\n"""${text.replace(/"""/g, "")}"""`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } } | null;
    if (!res.ok) {
      reportGemini("text", `${res.status} (model ${MODEL})`);
      return { result: "error", reason: `gemini ${res.status}` };
    }
    if (body?.promptFeedback?.blockReason) return { result: "blocked", category: "other", reason: "input refused by Gemini" };
    const answer = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(answer) as { verdict?: string; category?: string; reason?: string };
    if (parsed.verdict === "block") return { result: "blocked", category: String(parsed.category ?? "other").slice(0, 40), reason: String(parsed.reason ?? "").slice(0, 300) };
    if (parsed.verdict === "allow") return { result: "allowed" };
    return { result: "error", reason: "unreadable answer" };
  } catch (error) {
    return { result: "error", reason: String((error as Error)?.message ?? error).slice(0, 300) };
  }
}

// «صوّر معك», like a lens: how close is each of these other shots to the new one (image 1)?
// One call for all of them. Three levels (the owner of the site asked for broad matching,
// «مش لازم تكون المطابقة 100»):
//   same    — the same subject: the same lily, the same dish, the same building, view or event;
//   similar — the same kind of thing with a similar look: two different flowers, two plates of
//             food, two green gardens, two sunsets;
//   no      — different kinds (a flower and a car), or unsure.
// On any failure: all «no» (a suggestion is never worth a wrong one).
export type Likeness = "same" | "similar" | "no";
const LIKENESS_PROMPT = `You match photos for Zawmo's "shoot together": people who photographed the same or a similar thing at about the same time can join one shared moment.

Image 1 is a new photo. Each following image is from someone else's moment. For each following image, compare it with image 1:
- "same": the same specific subject — the same flower or plant, the same dish, the same animal, the same building, monument, view or landscape, the same event or gathering, the same object — even from another angle, distance or light.
- "similar": the same kind of thing with a similar look, but not the same one — e.g. two different flowers, two plates of food, two green gardens or fields, two sunsets, two city streets, two cups of coffee.
- "no": different kinds of things (a flower and a car, food and the sea, a selfie and a building), or anything you are unsure about.

Each image is labelled just before it ("Image 2:", "Image 3:", …). Answer only with JSON, one entry per labelled image after image 1, keyed by its number: {"likeness":{"2":"same"|"similar"|"no","3":…}}`;

export async function likeness(mine: string, others: string[]): Promise<Likeness[]> {
  const none: Likeness[] = others.map(() => "no");
  if (!screeningEnabled() || !others.length) return none;
  try {
    const res = await callGemini({
      body: JSON.stringify({
        // Every picture labelled with its number: counting unlabelled pictures, the model
        // sometimes answered one short (5 answers for 6 pictures) and the whole check was lost.
        contents: [
          {
            role: "user",
            parts: [{ text: LIKENESS_PROMPT }, ...[mine, ...others].flatMap((data, i) => [{ text: `Image ${i + 1}:` }, { inline_data: { mime_type: "image/jpeg", data } }])],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      reportGemini("lens", `${res.status} (model ${MODEL})`);
      return none;
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const got = (JSON.parse(text) as { likeness?: unknown }).likeness;
    const level = (x: unknown): Likeness => (x === "same" || x === "similar" ? x : "no");
    // Keyed by image number (a missing one counts as «no»); a plain list only when it's complete.
    if (got && typeof got === "object" && !Array.isArray(got)) return others.map((_, i) => level((got as Record<string, unknown>)[String(i + 2)]));
    if (Array.isArray(got) && got.length === others.length) return got.map(level);
    reportGemini("lens", `unreadable answer: ${text.slice(0, 80)}`);
    return none;
  } catch (error) {
    reportGemini("lens", String((error as Error)?.message ?? error));
    return none;
  }
}

// A picture as base64 JPEG for Gemini, from a short-lived signed URL.
export async function pictureBase64(url: string | null) {
  if (!url) return null;
  try {
    return await jpegBase64(url);
  } catch {
    return null;
  }
}
