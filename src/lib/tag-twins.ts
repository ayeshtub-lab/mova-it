import { tagPhrase } from "@/lib/tag-phrase";
import { HUB_TAGS } from "@/lib/tag-hub";

// «توأم» hashtag pages (2026-11-11): #قهوة, #صور_قهوة and #صور_قهوة_حقيقية each had a page, all three
// titled «صور قهوة حقيقية» (src/lib/tag-phrase.ts) — the same words in Google's eyes, competing for
// the same searches (Search Console: صور_قهوة_حقيقية 232 → 99 impressions as صور_قهوة_الصباح_حقيقية
// rose 19 → 120; 13 such families, 27 pages, on 11/11). Tags whose page would say the same words —
// and spellings that differ only by hamza, ى/ي, ة/ه («الارض»/«الأرض», as the sitemap always did) —
// are one family: one main page (mainOf, below) lists them all and is the canonical
// one; the others stay open and point to it.

const fold = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة(?=[_\s]|$)/g, "ه");
export const twinKey = (tag: string) => fold(tagPhrase(tag, "ar"));

// The family's main tag: the one whose address already says the searched words (#صور_قهوة_حقيقية
// for «صور قهوة حقيقية» — the pages Google showed most, 11/11; once it is a page of its own, in 3
// moments, as /tag/[tag] indexes), then a collection page
// (src/lib/tag-hub.ts), then the one in the most moments, the shorter, by name — the same answer
// every time.
const saysIt = (tag: string) => fold(tag.replace(/_/g, " ")) === twinKey(tag);
export function mainOf<T extends { tag: string; count: number }>(list: T[]): T {
  const rank = (t: T) => [Number(t.count >= 3 && saysIt(t.tag)), Number(HUB_TAGS.has(t.tag)), t.count, -t.tag.length];
  return [...list].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return a.tag.localeCompare(b.tag);
  })[0];
}

// tag → { main, members, count } for every tag given (members: the whole family, main first;
// count: the moments of them all, roughly — one moment may carry two of them).
export function twinFamilies<T extends { tag: string; count: number }>(tags: T[]) {
  const byKey = new Map<string, T[]>();
  for (const t of tags) byKey.set(twinKey(t.tag), [...(byKey.get(twinKey(t.tag)) ?? []), t]);
  const out = new Map<string, { main: string; members: string[]; count: number }>();
  for (const list of byKey.values()) {
    const main = mainOf(list).tag;
    const family = { main, members: [main, ...list.map((t) => t.tag).filter((t) => t !== main)], count: list.reduce((n, t) => n + t.count, 0) };
    for (const t of list) out.set(t.tag, family);
  }
  return out;
}
