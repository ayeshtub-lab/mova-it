import { db } from "@/lib/db";
import { normalize, withoutAl } from "@/lib/arabic";
import { placeViews, type PlaceView } from "@/server/places";

// «📍 أرطاس؟»: a shot without a place, in a moment whose name says where — «عرس في أرطاس»,
// «غروب العقبة» — is offered that place, one tap to confirm (the uploader, and «📍 وين صوّرتهن؟»). Never set by itself: the person says yes. No AI — the
// words are matched against Zawmo's list of places (src/server/places.ts), kept in memory.

type Known = { id: string; key: string; size: number; kind: string; ps: boolean; population: number };
const KIND_RANK: Record<string, number> = { CITY: 0, TOWN: 1, CAMP: 2, VILLAGE: 3, NEIGHBOURHOOD: 4, GOVERNORATE: 5 };
// Words that are also places but nearly always mean something else in a moment's name.
const NOT_PLACES = new Set([
  // colours, looks and everyday words («زهور بيضاء», «سماء زرقاء», «لحظة جديدة», «صور العرس»)
  "البيضاء", "بيضاء", "الزرقاء", "زرقاء", "الخضراء", "الحمراء", "السوداء", "الصفراء", "الجميل", "جميل", "جمال", "الجديده", "جديده", "الكبير", "الصغير",
  "صور", "الطبقه", "طبقه", "العماره", "عماره", "الزاويه", "زاويه", "البرج", "برج", "بركه", "البركه", "النعمان", "الساحه", "الحديقه", "المزرعه", "مزرعه",
  "الشمال", "الجنوب", "الشرق", "الغرب", "الوسط", "النخيل", "الزيتون", "العنب", "التين", "الرمان", "الريحان", "الياسمين", "السماء", "القمر", "الشمس", "الهلال", "النجمه",
  "سوق", "السوق", "البلد", "بلد", "المدينه", "مدينه", "الجبل", "جبل", "البحر", "بحر", "العين", "عين", "النبي", "الوادي", "وادي", "المخيم", "مخيم", "القريه", "البيت", "بيت", "الحي", "النور", "الامل", "السلام", "الربيع", "الزهور", "الورود", "الشاطي", "النصر", "الرحمه", "الهدي"].map(normalize));

let cache: { at: number; byKey: Map<string, Known[]> } | null = null;
const CACHE_MS = 60 * 60 * 1000;

async function knownPlaces() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byKey;
  const rows = await db.place.findMany({ where: { kind: { notIn: ["COUNTRY"] } }, select: { id: true, nameAr: true, kind: true, countryCode: true, population: true } });
  const byKey = new Map<string, Known[]>();
  for (const r of rows) {
    const key = normalize(r.nameAr);
    if (key.length < 3 || NOT_PLACES.has(key)) continue;
    const words = r.nameAr.trim().split(/\s+/).length;
    for (const k of new Set([key, withoutAl(key)])) {
      if (k.length < 3 || NOT_PLACES.has(k)) continue;
      const list = byKey.get(k) ?? [];
      list.push({ id: r.id, key: k, size: words, kind: r.kind, ps: r.countryCode === "PS", population: r.population ?? 0 });
      byKey.set(k, list);
    }
  }
  cache = { at: Date.now(), byKey };
  return byKey;
}

// The place a text names, if any: the longest name found (1 to 3 words, «بيت لحم» before «لحم»),
// a word's «ب/و/ل/في» in front allowed («بأرطاس»); the same name twice → a city before a town
// or village (Aqaba the city), Palestine first, then the bigger one. Only words people wrote —
// never the line the AI wrote for a shot (its adjectives are town names too: «البيضاء»).
export async function placeInText(...texts: (string | null | undefined)[]): Promise<string | null> {
  const byKey = await knownPlaces();
  const found: Known[] = [];
  for (const text of texts) {
    if (!text) continue;
    const words = text.replace(/#/g, " ").split(/[\s،,.!؟?:؛\-–—()«»"']+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      for (let n = 3; n >= 1; n--) {
        if (i + n > words.length) continue;
        const raw = normalize(words.slice(i, i + n).join(""));
        // «بأرطاس», «وبيت لحم», «لعمّان»: one letter stuck on the front.
        const tries = [raw, ...(raw.length > 4 && /^[بولفك]/.test(raw) ? [raw.slice(1)] : [])];
        const hit = tries.flatMap((k) => byKey.get(k) ?? []);
        if (hit.length) {
          found.push(...hit.map((h) => ({ ...h, size: n })));
          i += n - 1;
          break;
        }
      }
    }
  }
  if (!found.length) return null;
  found.sort(
    (a, b) =>
      b.size - a.size ||
      (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) ||
      Number(b.ps) - Number(a.ps) ||
      b.population - a.population,
  );
  return found[0].id;
}

// The same, ready for the page: its name and «بيت لحم، فلسطين».
export async function guessPlace(...texts: (string | null | undefined)[]): Promise<PlaceView | null> {
  const id = await placeInText(...texts).catch(() => null);
  return id ? ((await placeViews([id])).get(id) ?? null) : null;
}
