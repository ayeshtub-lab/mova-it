import { normalizeTag } from "@/lib/hashtags";

// «زاوية الموسم» (src/server/seasons.ts): is a hashtag about the season? Yes when one of its words
// (split on _) is one of the season's words — #غيوم_ماطرة has «غيوم», #صوبة_حطب has «حطب» — so the
// long tail of tags Zawmo writes for each picture counts, while #شتلة_زيتون (a seedling) or
// #قهوة_مثلجة (iced coffee) don't pass for winter. Plain string work: runs anywhere.
export function seasonWords(words: string[]) {
  return new Set(words.map((w) => normalizeTag(w.trim().replace(/^#/, ""))).filter(Boolean));
}

export function tagInSeason(tag: string, words: Set<string>) {
  return normalizeTag(tag)
    .split("_")
    .some((w) => words.has(w));
}

// The words as typed in the admin form («شتاء، مطر #غيوم»): one list, no repeats.
export function parseWords(text: string) {
  return [...seasonWords(text.split(/[\s,،]+/u))].filter((w) => /^[\p{L}\p{N}]{2,30}$/u.test(w)).slice(0, 60);
}

// Moment codes as typed (pinned moments): their codes only, in the order given.
export function parseCodes(text: string) {
  return [...new Set(text.toUpperCase().split(/[^A-Z0-9]+/).filter((c) => /^[2-9A-HJKMNP-Z]{6}$/.test(c)))].slice(0, 12);
}
