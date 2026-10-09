import { hashtagsIn } from "@/lib/hashtags";

// Words that say nothing about what was shot.
export const NOT_TOPICS = new Set(["زاومو", "zawmo", "لحظة", "لحظات", "لحظاتك", "صورة", "صور", "تصويري", "اكسبلور", "explore", "explorepage", "fyp", "foryou", "viral", "ترند", "reels"]);

// True, but said of half the shots: kept only when nothing more telling is there.
const GENERAL = new Set(["طبيعه", "روقان", "زراعه", "زراعه منزليه", "جمال", "هدوء", "براءه", "يوميات", "حياه يوميه"]);

// Spelled the way people type in a search box: no tashkeel, one alef, ه for ة, ي for ى.
const bare = (s: string) =>
  s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_]+/g, " ")
    .trim()
    .toLowerCase();
// Each word as it is and without «و» / «ال» in front: «وامطار الشتاء» and «شتاء» share «شتاء»,
// and «ورد» stays «ورد».
const stems = (s: string) =>
  new Set(
    bare(s)
      .split(" ")
      .flatMap((w) => [w, w.replace(/^ال/, ""), w.replace(/^و/, ""), w.replace(/^وال/, "")])
      .filter((w) => w.length >= 3),
  );
const share = (a: Set<string>, b: Set<string>) => [...a].some((w) => b.has(w));

// What a moment's shots show, in two words or less, for its search title when its name doesn't
// say it: «من انتاج مزرعتي» → «طماطم وخيار». Only from each shot's own line (the content
// check's #tags of what is really in the picture — never the owner's caption), the most shown
// first. Empty when the name already shares a word with any of the main ones, or when nothing is
// known — a place («#بيت_لحم») says where, not what, and is left to the title's «في …».
export function shotWords(aiTexts: (string | null | undefined)[], name: string, where?: string | null, take = 2): string[] {
  const count = new Map<string, { tag: string; n: number }>();
  for (const text of aiTexts)
    for (const tag of hashtagsIn(text)) {
      const key = bare(tag);
      count.set(key, { tag: count.get(key)?.tag ?? tag.replace(/_+/g, " "), n: (count.get(key)?.n ?? 0) + 1 });
    }
  const place = where ? bare(where) : "";
  const main = [...count]
    .filter(([key]) => [...key].length >= 2 && !/^\d+$/.test(key) && !NOT_TOPICS.has(key.replace(/ /g, "_")) && !(place && (place.includes(key) || key.includes(place))))
    .sort(([a, x], [b, y]) => Number(GENERAL.has(a)) - Number(GENERAL.has(b)) || y.n - x.n) // stable: ties keep the shots' order
    .slice(0, 3);
  const named = stems(name);
  if (main.some(([key]) => share(stems(key), named))) return [];
  // Two different things, not one said twice («تين» and «موسم التين»).
  const picked: [string, { tag: string }][] = [];
  for (const m of main) if (picked.length < take && !picked.some(([key]) => share(stems(key), stems(m[0])))) picked.push(m);
  return picked.map(([, t]) => t.tag);
}
