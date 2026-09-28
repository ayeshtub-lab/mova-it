// Arabic text matching for places: people write «بيتلحم», «بيت لحم», «بَيت لحم»,
// «ارطاس» for «أرطاس», «قلقيليه» for «قلقيلية». normalize() folds all of these to one
// form; it is used both when storing a place's search key and when reading a query.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat, tatweel

export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, ""); // spaces, dashes, punctuation: «بيت-لحم» = «بيتلحم»
}

// The same, without a leading «ال» (so «خضر» finds «الخضر»).
export const withoutAl = (normalized: string) => (normalized.startsWith("ال") && normalized.length > 3 ? normalized.slice(2) : normalized);

// A page address from an Arabic name: «بيت لحم» → «بيت-لحم».
export function slugOf(text: string) {
  return text
    .replace(DIACRITICS, "")
    .trim()
    .replace(/[\s_/\\.,،]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
