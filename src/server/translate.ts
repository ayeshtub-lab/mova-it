import { db } from "@/lib/db";
import { englishPlace } from "@/server/english-place";
import { callGemini, englishLine, screeningEnabled } from "@/server/screening";

// Zawmo in English (2026-10-21): every public shot and moment gets its English words from the
// Arabic ones already written — a few at a time from the cron, so the old ones are done within
// hours and any title edited later is written again (its English is cleared on edit). Text only,
// no pictures: ~1/20 of a cent a shot. New shots get theirs in the same call as their Arabic
// (src/server/screening.ts DESCRIBE); this only fills what is missing.
//
// The rules (his, 2026-10-21): English SEO in the words people really search with, not a
// word-for-word translation; the place as the city or governorate English searchers know
// («Bethlehem, Palestine», never the village — src/server/english-place.ts).

const PROMPT = `You write the English for Zawmo, a site of real photos and videos people share of the same moment (coffee, food, nature, harvests, family occasions in Palestine and the Arab world).

For each item below you get its Arabic words and, when known, its place in English. Write English for people searching Google and Google Images outside the Arab world — as an English SEO lead would, NOT a word-for-word translation:
- Use the phrasing with real search demand: the common words people actually type (for example «homemade hummus», «olive harvest», «sunset over the sea», «Palestinian food», «real photo»), over literal or rare wording. Never stuff keywords; every word stays true to the Arabic.
- Titles carry NO place name — general and wide (his rule, 2026-10-21: no search ever came with a place in it), unless the place is a famous landmark that is itself the subject. The text names the place once, exactly as given in English (a city or governorate), never a village; no place when none is given. Never invent one.
- No emoji, hashtags, quotation marks or app name. Title case for titles.

For a SHOT: "title" — 4 to 10 words, the subject first, then the setting; "text" — one or two factual sentences, 18 to 35 words, saying it is a real photo or a real video.
For a MOMENT: "title" — 2 to 7 words, the moment's name as an English searcher would phrase it.

Answer only with JSON: {"shots":{"<id>":{"title":"…","text":"…"}},"moments":{"<code>":{"title":"…"}}}`;

// (2026-10-21: 22 at once took Gemini past 25 s — the first live run timed out; 10, with a minute.)
const SHOTS_PER_CALL = 6;
const MOMENTS_PER_CALL = 4;

const shown = { visibility: "PUBLIC" as const, status: "ACTIVE" as const, demo: false };

// One batch: the shots and moments still without their English. Returns how many got it.
// `preview`: nothing is saved — what would be written comes back instead (to read it before).
export async function translatePending(preview?: { write: (line: string) => void }) {
  if (!screeningEnabled()) return 0;
  const [shots, moments] = await Promise.all([
    db.angle.findMany({
      where: { status: "READY", screening: "allowed", aiTitle: { not: "" }, AND: [{ aiTitle: { not: null } }], aiTitleEn: null, moment: shown },
      select: { id: true, aiTitle: true, aiText: true, placeId: true, contributorId: true, moment: { select: { placeId: true, creatorId: true } } },
      orderBy: { uploadedAt: "desc" },
      take: SHOTS_PER_CALL,
    }),
    db.moment.findMany({ where: { ...shown, titleEn: null, named: true }, select: { code: true, title: true, description: true, placeId: true }, orderBy: { lastActivityAt: "desc" }, take: MOMENTS_PER_CALL }),
  ]);
  if (!shots.length && !moments.length) return 0;

  // The place: the shot's own, or the moment's when its creator took it (as for the Arabic).
  const placeOf = (s: (typeof shots)[number]) => s.placeId ?? (s.contributorId === s.moment.creatorId ? s.moment.placeId : null);
  const lines = [
    ...(await Promise.all(shots.map(async (s) => ({ kind: "SHOT", id: s.id, arabicTitle: s.aiTitle, arabicText: (s.aiText ?? "").replace(/#\S+/g, "").trim(), place: await englishPlace(placeOf(s)) })))),
    ...(await Promise.all(moments.map(async (m) => ({ kind: "MOMENT", code: m.code, arabicTitle: m.title, arabicText: (m.description ?? "").replace(/#\S+/g, "").trim().slice(0, 200), place: await englishPlace(m.placeId) })))),
  ];
  const res = await callGemini({
    purpose: "translate",
    timeoutMs: 60_000,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${PROMPT}\n\nITEMS:\n${JSON.stringify(lines)}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const answer = JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}") as {
    shots?: Record<string, { title?: unknown; text?: unknown }>;
    moments?: Record<string, { title?: unknown }>;
  };

  let done = 0;
  for (const s of shots) {
    const got = answer.shots?.[s.id];
    const title = englishLine(got?.title, 100);
    if (!title) continue;
    if (preview) {
      preview.write(`${s.aiTitle}  →  ${title}  |  ${englishLine(got?.text, 300)}`);
      continue;
    }
    await db.angle.update({ where: { id: s.id }, data: { aiTitleEn: title, aiTextEn: englishLine(got?.text, 300) || null } });
    done++;
  }
  for (const m of moments) {
    const title = englishLine(answer.moments?.[m.code]?.title, 80);
    if (!title) continue;
    if (preview) {
      preview.write(`[moment] ${m.title}  →  ${title}`);
      continue;
    }
    await db.moment.update({ where: { code: m.code }, data: { titleEn: title } });
    done++;
  }
  return done;
}
