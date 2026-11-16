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

// Since 2026-11-05 (his call: «من المكتبة بما يناسب الصور، مش بس الطبيعة») also the occasions and
// the nasheeds — but those only where the pictures call for them (a wedding, a mother, Ramadan…),
// never as the general fallback, which stays calm music.
// Since 2026-11-16 (his call: «يستعمل من كل المكتبة بما يناسب الصور… قران اناشيد حكم») also a
// verse — again only where the pictures call for it (the sea: «سخّر البحر»; the sky and its rain:
// «ونزّلنا من السماء ماءً»…), never as the fallback. A verse plays once, untouched (render.ts), so only
// verses short enough not to hold a film's last frame for long. (The people's wise words stay out:
// a spoken line of a few seconds would loop over and over under the whole part.)
const LISTS = ["calm", "daf", "nature", "occasions", "nasheed", "quran"] as const;
const ONLY_WHEN_FITTING = new Set(["occasions", "nasheed", "quran"]);
// Too short to carry a part (a zaghrouta of 6 seconds).
const SHORTEST = 12;
const LONGEST_VERSE = 40;
// Library sounds whose names say nothing of it, yet insects can be heard in them (his 2026-11-16:
// crickets under the best cloud films). Checked by listening: «تغريد العندليب» has cicadas at
// 0:24–0:30; «نسمة بين الشجر» is a summer ambience with faint insects. Still in the library for
// anyone who picks them by hand, never under a film by itself.
const HEARD_INSECTS = new Set(["n03", "n15"]);
// Never under a film, whatever the pictures (his call, 2026-10-23): animals and insects — frogs,
// sheep, goats, a rooster, crickets… (birds, water, fire and wind stay).
const NEVER = /ضفدع|ضفادع|بِ?ركة|خراف|خروف|غنم|ماعز|معز|ديك|دجاج|صرصور|صراصير|حشر|بقر|حمار|كلب|قطط|قطة|حصان|نحل|زيز|جندب|جنادب|حيوان|\b(?:pond|frogs?|toads?|sheep|goats?|roosters?|chickens?|crickets?|cicadas?|grasshoppers?|insects?|cows?|donkeys?|dogs?|cats?|horses?|bees?|animals?|farm|barn)\b/i;
type Candidate = { key: string; cat: string; words: string; seconds?: number };

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
  { shot: /عرس|زفة|زفاف|عريس|عروس|دبكة|حنة|حناء/, sound: /wedding|زفة|عرس|darbuka|دربكة/i },
  { shot: /عيد|احتفال|تخرج|نجاح|مباراة|ملعب|حفلة|مهرجان|فوز/, sound: /cheer|clap|تصفيق|هتاف|fireworks|ألعاب نارية|darbuka|دربكة/i },
  // (Whole words only: «امي» is inside «أمامي».)
  { shot: /(?:^|[\s#_])(?:أمي|امي|ماما|والدتي|ستي|جدتي)(?=$|[\s#_.،!؟])|يوم الأم/, sound: /mother|أُمّي|أمي/i },
  { shot: /رمضان|إفطار|افطار|سحور|مسجد|جامع|المولد|النبي|صلاة|عمرة|حج|الأقصى|هلال/, sound: /praise|peace be upon|مديح|سلام/i },
  { shot: /غروب|شروق|شمس|أفق|هدوء|سكينة/, sound: /dream|stillness|gymnop|nocturne|träumerei|حالم|سكون|ساتي|شوبان|شومان|أحلام/i },
  // Clouds: the calm, dreamy pieces (before 2026-11-16 a cloud matched nothing but «سماء», so the
  // same few sounds — and the nightingale with its cicadas — went under every cloud film).
  { shot: /غيم|غيوم|سحاب|سحب|سماء|سما/, sound: /dream|stillness|nocturne|gymnop|حالم|سكون|نوكتورن|ساتي|breeze|نسمة/i },
  // The verses, by what they speak of (their names in src/lib/sounds.ts).
  { shot: /بحر|شاطئ|شط|موج|سفين|قارب|ميناء/, sound: /سخّر البحر|البحرين/ },
  { shot: /غيم|غيوم|سحاب|سحب|سماء|سما|مطر|شتاء|شتا/, sound: /من السماء ماءً|المعصرات|خلق السماوات|خلق الرحمن/ },
  { shot: /زرع|زيتون|شجر|نبات|حقل|بستان|ورد|زهر|خضرة|ربيع|سهل/, sound: /أنبتنا|الزرع والزيتون|كلمة طيبة|صُنع الله/ },
  { shot: /جبل|جبال|وادي|أرض|طبيعة|منظر|سهل/, sound: /الأرض مهادًا|مدّ الأرض|صُنع الله/ },
  { shot: /شمس|غروب|شروق|ضحى/, sound: /والشمس وضحاها/ },
  { shot: /فجر/, sound: /قرآن الفجر/ },
  { shot: /جمل|جمال|إبل|ناقة/, sound: /الإبل/ },
  { shot: /رمضان|إفطار|افطار|سحور|مسجد|جامع|صلاة|الأقصى|هلال/, sound: /فاذكروني|قريب أجيب|مقيم الصلاة/ },
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
    ...SOUNDS.filter((s) => (LISTS as readonly string[]).includes(s.cat) && s.seconds >= SHORTEST && (s.cat !== "quran" || s.seconds <= LONGEST_VERSE)).map((s) => ({ key: s.key, cat: s.cat, words: `${s.ar} ${s.en}`, seconds: s.seconds })),
    ...curated.map((s) => ({ key: s.key, cat: s.category!, words: s.name })),
  ].filter((s) => !NEVER.test(s.words) && !HEARD_INSECTS.has(s.key) && (!solemn || s.cat === "nature" || s.cat === "quran"));
  const used = new Set<string>();

  // The sound for one silent photo: the best fit for its words; else a calm one (a feast or a
  // wedding: the daf too). `last`: the sound just before it, never repeated back to back.
  // `seed`: what varies the choice between equally fitting sounds. A part passes its moment and
  // its number, so the parts of one moment don't all get the same sound (before 2026-11-16 the
  // seed was the moment alone: one sound under every part of it).
  return async function pick(shot: { id: string; scene: string | null; aiText: string | null }, momentTitle: string, last: string | null, seed = shot.id): Promise<Sound | null> {
    const text = `${SCENE_WORDS[shot.scene ?? ""] ?? ""} ${shot.aiText ?? ""} ${momentTitle}`;
    const rainy = /مطر|شتاء|شتا/.test(text) || shot.scene === "rain";
    const open = pool.filter((s) => s.key !== last && (rainy || !WEATHER.test(s.words)));
    const score = (s: Candidate) => THEMES.reduce((n, t) => n + (t.shot.test(text) && t.sound.test(s.words) ? 1 : 0), 0);
    let choices = open.map((s) => ({ s, n: score(s) })).filter((c) => c.n > 0 || !ONLY_WHEN_FITTING.has(c.s.cat));
    // Every sound that fits the pictures is a choice, not only the single best match: the best
    // alone was one or two sounds (an oud under 45 of 138 films, 2026-11-16). A verse, a nasheed or
    // an occasion's sound still only where it fits.
    if (choices.some((c) => c.n > 0)) choices = choices.filter((c) => c.n > 0);
    else {
      // Nothing in the pictures to go by: calm music only — never an animal or a pond by chance —
      // with the daf for a celebration.
      const general = choices.filter((c) => c.s.cat === "calm" || (c.s.cat === "daf" && EVENT.test(text)));
      if (general.length) choices = general;
    }
    // A verse now and then, not under every film it fits (with every fitting verse a choice, a
    // third of the films would have had one): about one in four, when other sounds fit too.
    const verses = choices.filter((c) => c.s.cat === "quran");
    if (verses.length && verses.length < choices.length)
      choices = hash(`${seed}:verse`) % 4 === 0 ? verses : choices.filter((c) => c.s.cat !== "quran");
    // One not yet heard in this film, while there is one.
    const fresh = choices.filter((c) => !used.has(c.s.key));
    if (fresh.length) choices = fresh;
    if (!choices.length) return null;
    const chosen = choices[hash(seed) % choices.length].s;
    used.add(chosen.key);
    return chosen.key.startsWith("u") ? resolveSound(chosen.key) : soundByKey(chosen.key);
  };
}
