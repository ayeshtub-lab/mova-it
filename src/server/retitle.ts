import { db } from "@/lib/db";
import { callGemini, screeningEnabled } from "@/server/screening";

// Titles without the place (his call, 2026-10-21): «… في أرطاس» in a hundred titles, «… بالخضر» in a
// hundred more — and Search Console (28 days, 131 image searches and 37 web ones) had not one search
// with a place in it: people search the subject («صور قهوة حقيقية» 429 times), across the Arab
// world. New titles are written so (src/server/screening.ts DESCRIBE); this rewrites the old ones,
// once: a title it has rewritten has no place left in it, so it is never picked again (and if
// Gemini leaves the place in, it is taken out here).
//
// A name counts only where it stands as a place — «في الخضر», «بالخضر», «محافظة بيت لحم» — never
// on its own: «صور الخضر» is people looking for vegetables (16 searches), not the town.

const PROMPT = `You edit the Arabic titles of real photos and videos on Zawmo. Each title below ends with or contains a place (a village, town, city, governorate or country). Take ONLY the place out — the place name and the little word tying it (في، ب، من، قرب، محافظة، بلدة، قرية) — and keep EVERY other word exactly as it is, in the same order: these titles are already found on Google by those words («صور حلويات حقيقية», «صور ازهار جميلة», «صور مزرعة حقيقية», «قهوة الصباح»). Change nothing else. Only if what is left reads broken or has fewer than 4 words, add one or two plain words taken from the description (never invented). No emoji, no hashtags, no quotation marks, no year.

Answer only with JSON: {"<id>":"<the new title>"}`;

const PER_CALL = 25;
const EVERYDAY = new Set(["صور", "صورة", "عين", "بيت", "الطور", "الجبل", "السهل", "الوادي", "البحر", "النهر", "المزرعة", "الحديقة"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let names: Promise<RegExp[]> | null = null;
export function placePatterns() {
  // Palestine's places only (the shots' own) — and never a name that is an everyday word: «في صور
  // مزرعة حقيقية» is pictures, not Tyre (2026-10-21, the first preview).
  names ??= db.place.findMany({ where: { kind: { not: "NEIGHBOURHOOD" }, OR: [{ countryCode: "PS" }, { kind: "COUNTRY" }] }, select: { nameAr: true } }).then((rows) => {
    const unique = [...new Set(rows.map((r) => r.nameAr.trim()).filter((n) => [...n].length >= 3 && !EVERYDAY.has(n)))].sort((a, b) => b.length - a.length);
    return unique.map((n) => {
      const name = escape(n);
      return new RegExp(`(?:\\s|^)(?:(?:(?:في|من|قرب|عند)\\s+|ب)?(?:محافظة|قرية|بلدة|مدينة|مخيم)\\s+${name}|(?:(?:في|من|قرب|عند)\\s+|ب)${name})(?=$|[\\s،,.])`, "u");
    });
  });
  return names;
}

export const withoutPlace = (title: string, patterns: RegExp[]) => {
  let out = title;
  for (const re of patterns) for (let i = 0; i < 5 && re.test(out); i++) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").replace(/\s+(?:في|من|قرب|عند|و)$/u, "").trim();
};
export const named = (title: string, patterns: RegExp[]) => patterns.some((re) => re.test(title));

// One batch. `preview`: nothing saved, the old and new titles come back to be read first.
export async function retitlePending(preview?: { write: (line: string) => void }) {
  if (!screeningEnabled()) return 0;
  const patterns = await placePatterns();
  const shots = await db.angle.findMany({
    where: { status: "READY", screening: "allowed", aiTitle: { not: null } },
    select: { id: true, aiTitle: true, aiText: true },
    orderBy: { uploadedAt: "desc" },
  });
  const batch = shots.filter((s) => s.aiTitle && named(s.aiTitle, patterns)).slice(0, PER_CALL);
  if (!batch.length) return 0;
  const items = batch.map((s) => ({ id: s.id, title: s.aiTitle, description: (s.aiText ?? "").replace(/#\S+/g, "").trim().slice(0, 240) }));
  const res = await callGemini({
    purpose: "retitle",
    timeoutMs: 60_000,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${PROMPT}\n\nTITLES:\n${JSON.stringify(items)}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`retitle ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const answer = JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}") as Record<string, unknown>;

  let done = 0;
  for (const s of batch) {
    const got = typeof answer[s.id] === "string" ? (answer[s.id] as string).replace(/["«»#\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 90) : "";
    // (Gemini's when it left no place in it; else the old title with the place taken out.)
    const title = (got && [...got.split(" ")].length >= 3 && !named(got, patterns) ? got : withoutPlace(s.aiTitle!, patterns)).replace(/في طبيعة$/u, "في الطبيعة");
    if (preview) {
      preview.write(`${s.aiTitle}  →  ${title}${title === got ? "" : "  (cut here)"}`);
      continue;
    }
    // Its English goes too: written again from the new title (src/server/translate.ts).
    await db.angle.update({ where: { id: s.id }, data: { aiTitle: title, aiTitleEn: null, aiTextEn: null } });
    done++;
  }
  return done;
}
