// «📸 ضيف صورك» (2026-11-26): what a photo is about, from what the content check already wrote on
// it (its search title, aiTitle, and its scene) — so Zawmo can put many photos on the moments of
// their topics by itself. The same rules sorted three new members' 256 photos by hand on 26/11.

export type TopicKey = "moon" | "sweets" | "coffee" | "art" | "animals" | "winter" | "plants" | "sky" | "food" | "misc";

export type Topic = {
  key: TopicKey;
  emoji: string;
  // A new moment's name when Gemini gives none (src/server/sort.ts).
  title: string;
  titleEn: string;
  // A moment whose name says it is about this (the person's own, or a public one to join).
  name: RegExp;
};

export const TOPICS: Topic[] = [
  { key: "moon", emoji: "🌙", title: "القمر من عندي", titleEn: "The moon from my place", name: /قمر/ },
  { key: "sweets", emoji: "🍰", title: "حلويات وضيافة", titleEn: "Sweets", name: /حلو|كيك|كنافة|بوظة/ },
  { key: "coffee", emoji: "☕", title: "قهوتي", titleEn: "My coffee", name: /قهوة|فنجان|شاي/ },
  { key: "art", emoji: "🎨", title: "رسوماتي وألواني", titleEn: "My drawings", name: /رسم|رسومات|لوحة|ألوان|الوان|صلصال|فن/ },
  { key: "animals", emoji: "🐈", title: "قطط وحيوانات", titleEn: "Cats and animals", name: /قطط|القط|قطة|حيوان|عصفور|طيور/ }, // («قطرات المطر» is no cat)
  { key: "winter", emoji: "🌧️", title: "أجواء الشتاء", titleEn: "Winter", name: /شت[اوي]|مطر|نار|حطب/ },
  { key: "plants", emoji: "🌹", title: "ورد وزرع من حولي", titleEn: "Flowers and plants", name: /ورد|زهر|ازهار|أزهار|حديقة|حاكورة|زرع|نبات|خضار/ },
  { key: "sky", emoji: "☁️", title: "سماء وغيوم", titleEn: "Sky and clouds", name: /سما|غيوم|غروب|شفق|سحب/ },
  { key: "food", emoji: "🍲", title: "أكل بيتي", titleEn: "Home food", name: /أكل|اكل|طبخ|مطبخ|سفرة|طعام|وجبة/ },
  { key: "misc", emoji: "📷", title: "من يومياتي", titleEn: "From my days", name: /يومياتي/ },
];

export const topicByKey = (key: string) => TOPICS.find((t) => t.key === key) ?? TOPICS[TOPICS.length - 1];

// The photo's own words, checked in this order (a cup of coffee with a cake is coffee; a painting
// of flowers is art).
const WORDS: [TopicKey, RegExp][] = [
  ["moon", /قمر/],
  ["sweets", /صور حلويات|كيك|كنافة|بوظة|آيس|بقلاوة|ميرسي|جيلي|كوكيز|مارشميلو|مثلجات|حلويات/],
  ["coffee", /قهوة|فنجان|شاي/],
  ["art", /رسم|لوحة|رسومات|ألوان|صلصال|مجسم|خط عربي|خرز|فخار/],
  ["animals", /(^|\s)(قط|قطة|قطه|قطط)(\s|$)|عصفور|أرنب|ثعبان|حمام|دجاجات|خروف|ماعز|حصان|كلب/],
  ["winter", /نار|مدفأة|لهب|مطر|الشتاء|ثلج/],
  ["plants", /ازهار|أزهار|ورد|زهرة|نبات|زرع|شجر|حديقة|ياسمين|أشجار|كركديه|عباد الشمس|دوار الشمس/],
  ["sky", /غيوم|سماء|سحب|غروب|شفق/],
  ["food", /دجاج|شاورما|رز|أرز|بيتزا|فطائر|صفيحة|مسخن|ورق عنب|فواكه|فراولة|برتقال|كيوي|مكسرات|معجنات|مشروب|حمضيات|طبخ|وجبة|سفرة|خبز/],
];
const SCENES: Record<string, TopicKey> = { sky: "sky", sunset: "sky", rain: "winter", pets: "animals", nature: "plants", food: "food" };

export function topicOf(shot: { aiTitle: string | null; scene: string | null }): TopicKey {
  const t = shot.aiTitle ?? "";
  if (/^صور (ازهار|أزهار|نباتات|زرع)/.test(t)) return "plants";
  if (/قمر/.test(t)) return "moon";
  // Its scene says sky (a sunset over trees is the sky, not the trees) — unless it is coffee or sweets.
  if ((shot.scene === "sky" || shot.scene === "sunset") && !/قهوة|حلويات/.test(t)) return "sky";
  return WORDS.find(([, re]) => re.test(t))?.[0] ?? (shot.scene ? SCENES[shot.scene] : undefined) ?? "misc";
}
