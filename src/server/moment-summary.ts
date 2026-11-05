import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { hashtagsIn, normalizeTag } from "@/lib/hashtags";
import { momentLine } from "@/server/angles";
import { aiTextOf, callGemini, screenText, screeningEnabled } from "@/server/screening";

// A moment's description grows with it (2026-11-05, the owner of the site: «حيوانات» whose first
// shot was a rabbit stayed «أرنب…» however many goats and cats came after). While Zawmo wrote the
// description (Moment.descriptionAuto — never once its creator or staff edits it, never for the
// moments made before), it is written again from ALL its shots: at the 3rd, 5th and 10th shot,
// then every 10th — not at every shot, so what search engines read stays steady, and Gemini is
// asked rarely. The hashtags are only ones its shots already carry (they link to /tag/ pages
// that exist), and a public moment's line passes the text check first. Any doubt: left as it is.

const EARLY = new Set([3, 5, 10]);
export const summaryDue = (shots: number) => EARLY.has(shots) || (shots > 10 && shots % 10 === 0);

const MAX_LINES = 40;

// The hashtags its shots carry, the most shared first.
export function commonTags(lines: string[]) {
  const count = new Map<string, number>();
  for (const line of lines) for (const tag of new Set(hashtagsIn(line))) count.set(tag, (count.get(tag) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

// Gemini's answer as the moment's line: its sentence, and up to 4 hashtags from `allowed` only.
export function summaryLine(raw: unknown, allowed: string[]) {
  const parsed = (raw && typeof raw === "object" ? raw : {}) as { description?: unknown; hashtags?: unknown };
  const pool = new Set(allowed);
  const tags = (Array.isArray(parsed.hashtags) ? parsed.hashtags : [])
    .map((t) => (typeof t === "string" ? normalizeTag(t.replace(/^#+/, "").trim().replace(/\s+/g, "_")) : ""))
    .filter((t) => pool.has(t))
    .slice(0, 4);
  const sentence = typeof parsed.description === "string" ? parsed.description.trim() : "";
  if (sentence.length < 12) return null;
  const line = aiTextOf(sentence, tags.length ? tags : allowed.slice(0, 3));
  return line ? momentLine(line) : null;
}

const PROMPT = `You write the one-line description of a shared photo moment on Zawmo, an Arabic site where several people add photos and videos of the same moment.

Below are the moment's name and the descriptions of its shots (each written for one photo). Write ONE Arabic sentence, 12 to 25 words, that describes the WHOLE moment — everything its shots show together, not only the first one (for example a moment of animals with a rabbit, goats and cats is about all of them). Plain, factual Modern Standard Arabic understood across the Arab world; say they are real photos («صور حقيقية») when it reads naturally. Keep a place only if the shots name it. Never invent anything not in the shots, no names of people, no emoji, no quotation marks, no hashtags in the sentence.

Then choose 2 to 4 hashtags for the whole moment, ONLY from this list (copy them exactly, without #): {TAGS}

Answer only with JSON: {"description":"<the sentence>","hashtags":["<tag>","<tag>"]}`;

async function askSummary(title: string, lines: string[], tags: string[]) {
  const text = `${PROMPT.replace("{TAGS}", tags.join("، "))}\n\nMOMENT NAME: ${title.replace(/"""/g, "")}\n\nSHOTS:\n${lines.map((l, i) => `${i + 1}. ${l.replace(/"""/g, "")}`).join("\n")}`;
  const res = await callGemini({
    purpose: "moment-summary",
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const answer = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return JSON.parse(answer) as unknown;
}

// After a shot goes up (src/server/went-live.ts). Never throws.
// (`use`: Gemini and the text check, replaced in tests.)
export async function refreshMomentSummary(angleId: string, use: { ask?: typeof askSummary; screen?: typeof screenText } = {}) {
  const ask = use.ask ?? askSummary;
  const screen = use.screen ?? screenText;
  try {
    if (!use.ask && !screeningEnabled()) return;
    const angle = await db.angle.findUnique({ where: { id: angleId }, select: { momentId: true } });
    if (!angle) return;
    const moment = await db.moment.findUnique({
      where: { id: angle.momentId },
      select: { id: true, title: true, description: true, descriptionAuto: true, kind: true, visibility: true, status: true },
    });
    if (!moment?.descriptionAuto || !moment.description || moment.kind === "DAILY" || moment.status !== "ACTIVE") return;
    const shots = await db.angle.findMany({
      where: { momentId: moment.id, status: "READY", screening: "allowed" },
      orderBy: { uploadedAt: "asc" },
      select: { aiText: true },
    });
    if (!summaryDue(shots.length)) return;
    const lines = [...new Set(shots.map((s) => s.aiText?.trim()).filter((l): l is string => !!l))];
    if (lines.length < 2) return; // one kind of line: the first shot's still says it all
    // Spread over the whole moment when it has many: the first, the last, and evenly between.
    const picked = lines.length <= MAX_LINES ? lines : Array.from({ length: MAX_LINES }, (_, i) => lines[Math.round((i * (lines.length - 1)) / (MAX_LINES - 1))]);
    const tags = commonTags(lines).slice(0, 20);
    const line = summaryLine(await ask(moment.title, picked, tags), tags);
    if (!line || line === moment.description) return;
    if (moment.visibility === "PUBLIC" && (await screen(line)).result !== "allowed") return;
    // Only if nobody changed it meanwhile (its creator editing it right now wins).
    await db.moment.updateMany({ where: { id: moment.id, descriptionAuto: true, description: moment.description }, data: { description: line } });
  } catch (error) {
    console.error("moment summary failed", angleId, error);
    Sentry.captureMessage(`moment summary failed: ${String((error as Error)?.message ?? error).slice(0, 100)}`, { level: "warning", fingerprint: ["moment-summary"] });
  }
}
