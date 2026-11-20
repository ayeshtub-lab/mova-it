// «📖 سور من القرآن» (his 20/11): which verse a photo's story («📝 حكايات الصور») starts from, and
// how much of the recitation goes with it. Pure: the text and the timings come from the caller
// (src/server/quran-recite.ts). The words are matched as they are typed — without the marks, any
// alif or hamza the same, «ة» as «ه», «ى» as «ي» — and only a stretch found once settles it, so a
// phrase said in many verses («الذين آمنوا») never decides.

export type Verse = { surah: number; ayah: number; text: string };
export type Timing = { ayah: number; start: number; end: number }; // milliseconds in the surah's file

// The letters only, written one way.
export function normalizeArabic(text: string) {
  return text
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/[^ء-ي\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A surah's name as people write it: «سُورَةُ البَقَرَةِ» → «سورة البقرة».
export const plainName = (name: string) => name.replace(/[ً-ٰٟۖ-ۭـ]/g, "").replace(/ٱ/g, "ا").replace(/\s+/g, " ").trim().replace(/ ال عمران$/, " آل عمران");

const letters = (text: string) => normalizeArabic(text).replace(/ /g, "");

// The surah its story names («سورة البقرة»), by the names as the text source writes them
// («سُورَةُ البَقَرَةِ»): the longest name found, so «سورة النساء» is never «سورة الناس». null: none named.
export function namedSurah(note: string, names: { surah: number; name: string }[]) {
  const said = ` ${normalizeArabic(note)} `;
  let best: { surah: number; length: number } | null = null;
  for (const { surah, name } of names) {
    const n = normalizeArabic(name).replace(/^سوره /, "");
    if (!n) continue;
    if (said.includes(` سوره ${n} `) &&(!best || n.length > best.length)) best = { surah, length: n.length };
  }
  return best?.surah ?? null;
}

const WINDOW = 20; // letters: long enough to be said once only

// The verse the story's quoted words start in: the first stretch of the story found exactly once
// in the verses given (one surah, or all). null: no quoted words found.
export function startVerse(note: string, verses: Verse[]): Verse | null {
  const owner: number[] = [];
  let stream = "";
  verses.forEach((v, i) => {
    const l = letters(v.text);
    stream += l;
    for (let k = 0; k < l.length; k++) owner.push(i);
  });
  const said = letters(note);
  for (let off = 0; off + WINDOW <= said.length; off++) {
    const piece = said.slice(off, off + WINDOW);
    const at = stream.indexOf(piece);
    if (at < 0 || stream.indexOf(piece, at + 1) >= 0) continue;
    return verses[owner[at]];
  }
  return null;
}

// From the first verse, whole verses while the whole stays within `limit` ms — the first one
// always, however long (a verse is never cut). The verses after the surah's last are not there.
export function versesWithin(timings: Timing[], from: number, limit = 40_000) {
  const ordered = timings.filter((t) => t.ayah >= from).sort((a, b) => a.ayah - b.ayah);
  if (!ordered.length || ordered[0].ayah !== from) return null;
  const start = ordered[0].start;
  let last = ordered[0];
  for (const t of ordered.slice(1)) {
    if (t.ayah !== last.ayah + 1 || t.end - start > limit) break;
    last = t;
  }
  return { from, to: last.ayah, start, end: last.end };
}

// Numbers as people read them in Arabic: «٢٧٠–٢٧١».
const arabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
export const verseRange = (from: number, to: number) => (from === to ? arabicDigits(from) : `${arabicDigits(from)}–${arabicDigits(to)}`);
