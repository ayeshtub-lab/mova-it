import { db } from "@/lib/db";
import { soundByKey, SOUNDS, type Sound } from "@/lib/sounds";
import { resolveSound } from "@/server/sound-resolve";

// «أجزاء»: the ONE sound under a part's silent photos (src/server/montage/render.ts, his call
// 2026-10-23: a sound per photo made a choppy medley, and once the fitting ones were used the
// rest fell to any nature sound — frogs under sweets), chosen for what is in the pictures — its scene and the line written for it (src/server/screening.ts): the sea gets
// gulls and waves, a fire the crackle of wood, a wedding the daf, coffee in the morning a cozy
// tune… — never thunder or rain unless it is raining in it. The pool is the library's calm music,
// daf and nature, plus every member's sound a curator put in those lists: whatever is added
// there later joins by itself (matched by the words of its name). A moment of prayer or loss:
// nature only. Never the same sound twice in one part while another fits.

const LISTS = ["calm", "daf", "nature"] as const;
// Never under a film, whatever the pictures (his call, 2026-10-23): animals and insects — frogs,
// sheep, goats, a rooster, crickets… (birds, water, fire and wind stay).
const NEVER = /ضفدع|ضفادع|بِ?ركة|خراف|خروف|غنم|ماعز|معز|ديك|دجاج|صرصور|صراصير|حشر|بقر|حمار|كلب|قطط|قطة|حصان|نحل|زيز|جندب|جنادب|حيوان|\b(?:pond|frogs?|toads?|sheep|goats?|roosters?|chickens?|crickets?|cicadas?|grasshoppers?|insects?|cows?|donkeys?|dogs?|cats?|horses?|bees?|animals?|farm|barn)\b/i;
type Candidate = { key: string; cat: string; words: string };

// A shot's words → the words a fitting sound's name has (Arabic and English names both).
const THEMES: { shot: RegExp; sound: RegExp }[] = [
  { shot: /بحر|شاطئ|شط|موج|سفين|قارب|ميناء|بحيرة/, sound: /sea|wave|gull|بحر|موج|نورس|نوارس/i },
  { shot: /نار|حطب|شوي|مشاوي|كانون|موقد|تخييم|مخيم|سهرة/, sound: /fire|نار|حطب/i },
  { shot: /عصفور|عصافير|طيور|طير|حديقة|ورد|زهر|ربيع|شجر|بستان|زيتون|حقل|سهل|جبل|غابة|طبيعة|خضرة/, sound: /bird|nightingale|blackbird|breeze|عصافير|عندليب|شحرور|نسمة|شجر/i },
  { shot: /نهر|جدول|نبع|شلال|ماء|مية|بركة|سيل|وادي/, sound: /stream|water|pond|river|جدول|ماء|خرير|بركة|نهر/i },
  { shot: /ليل|قمر|نجوم|نجمة|سماء|سما/, sound: /night|nocturne|stillness|dream|ليل|سكون|حالم|نوكتورن/i },
  { shot: /مطر|شتاء|شتا|غيم|ضباب/, sound: /rain|مطر/i },
  { shot: /عرس|زفة|زفاف|عريس|عروس|دبكة|حنة|حناء|فرح|عيد|احتفال|تخرج|نجاح|مباراة|ملعب|حفلة|مهرجان/, sound: /drum|دف/i },
  { shot: /قهوة|فطور|صبح|صباح|شاي|مطبخ|أكل|طبخ|حلو|كعك|معمول|خبز|طابون|سفرة|غدا|عشا/, sound: /morning|cozy|guitar|oud|صبح|رواق|عود/i },
  { shot: /تراث|قديم|بلدة|حارة|سوق|جدة|ستي|سيدي|حجر|قرية|بيت/, sound: /oud|عود|taqsim|تقاسيم/i },
  { shot: /غروب|شروق|شمس|أفق|هدوء|سكينة/, sound: /dream|stillness|gymnop|nocturne|träumerei|حالم|سكون|ساتي|شوبان|شومان|أحلام/i },
];
// A shot's scene, in the words of the themes above.
const SCENE_WORDS: Record<string, string> = {
  sunset: "غروب", sunrise: "شروق", rain: "مطر", snow: "شتاء هدوء", sea: "بحر", sky: "ليل سماء", nature: "طبيعة",
  food: "أكل", wedding: "عرس", celebration: "احتفال", match: "مباراة", concert: "حفلة", gathering: "سهرة قهوة", street: "سوق", pets: "",
};
const WEATHER = /thunder|storm|rain|رعد|عاصفة|مطر/i;
const EVENT = /عرس|زفة|زفاف|دبكة|حنة|فرح|عيد|احتفال|تخرج|مباراة|حفلة|مهرجان/;

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// The pool, once per film: the library's lists, and the members' sounds a curator put in them.
export async function fillPicker(solemn: boolean) {
  const curated = await db.userSound
    .findMany({ where: { status: "public", shared: true, category: { in: [...LISTS] }, path: { not: null } }, select: { key: true, name: true, category: true } })
    .catch(() => []);
  const pool: Candidate[] = [
    ...SOUNDS.filter((s) => (LISTS as readonly string[]).includes(s.cat)).map((s) => ({ key: s.key, cat: s.cat, words: `${s.ar} ${s.en}` })),
    ...curated.map((s) => ({ key: s.key, cat: s.category!, words: s.name })),
  ].filter((s) => !NEVER.test(s.words) && (!solemn || s.cat === "nature"));
  const used = new Set<string>();

  // The sound for one silent photo: the best fit for its words; else a calm one (a feast or a
  // wedding: the daf too). `last`: the sound just before it, never repeated back to back.
  return async function pick(shot: { id: string; scene: string | null; aiText: string | null }, momentTitle: string, last: string | null): Promise<Sound | null> {
    const text = `${SCENE_WORDS[shot.scene ?? ""] ?? ""} ${shot.aiText ?? ""} ${momentTitle}`;
    const rainy = /مطر|شتاء|شتا/.test(text) || shot.scene === "rain";
    const open = pool.filter((s) => s.key !== last && (rainy || !WEATHER.test(s.words)));
    const score = (s: Candidate) => THEMES.reduce((n, t) => n + (t.shot.test(text) && t.sound.test(s.words) ? 1 : 0), 0);
    const fresh = open.filter((s) => !used.has(s.key));
    let choices = (fresh.length ? fresh : open).map((s) => ({ s, n: score(s) }));
    const best = Math.max(0, ...choices.map((c) => c.n));
    if (best > 0) choices = choices.filter((c) => c.n === best);
    else {
      // Nothing in the pictures to go by: calm music only — never an animal or a pond by chance —
      // with the daf for a celebration.
      const general = choices.filter((c) => c.s.cat === "calm" || (c.s.cat === "daf" && EVENT.test(text)));
      if (general.length) choices = general;
    }
    if (!choices.length) return null;
    const chosen = choices[hash(shot.id) % choices.length].s;
    used.add(chosen.key);
    return chosen.key.startsWith("u") ? resolveSound(chosen.key) : soundByKey(chosen.key);
  };
}
