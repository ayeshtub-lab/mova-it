// The curated themes for «لحظة اليوم». People vote among three of these for the next
// day; nobody types free text, so a theme can never be offensive or an ad. Keys are
// stored in the database — add new ones freely, but never rename or remove a key.

export type DailyTheme = { key: string; emoji: string; ar: string; en: string; tip?: { ar: string; en: string } };

const MOSQUE_TIP = {
  ar: "صوّر المسجد والسماء والطريق، واحترم المصلّين: لا تصوّر أحدًا أثناء صلاته.",
  en: "Capture the mosque, the sky and the way there — and respect worshippers: never photograph anyone while they pray.",
};

export const DAILY_THEMES: DailyTheme[] = [
  { key: "coffee", emoji: "☕", ar: "قهوتك الصباحية", en: "Your morning coffee" },
  { key: "window", emoji: "🪟", ar: "المنظر من شباكك", en: "The view from your window" },
  { key: "meal", emoji: "🍽️", ar: "أكلة اليوم", en: "Today's meal" },
  { key: "sunset", emoji: "🌅", ar: "غروب اليوم", en: "Today's sunset" },
  { key: "laugh", emoji: "😂", ar: "شي أضحكك اليوم", en: "Something that made you laugh" },
  { key: "fajr", emoji: "🕌", ar: "مسجد حيّك وقت الفجر", en: "Your local mosque at dawn", tip: MOSQUE_TIP },
  { key: "street", emoji: "🛣️", ar: "شارعك", en: "Your street" },
  { key: "sky", emoji: "☁️", ar: "السماء الآن", en: "The sky right now" },
  { key: "animal", emoji: "🐾", ar: "حيوان صادفته", en: "An animal you met" },
  { key: "steps", emoji: "👟", ar: "وين مشيت اليوم؟", en: "Where your feet took you" },
  { key: "reading", emoji: "📖", ar: "شي تقرأه", en: "Something you're reading" },
  { key: "green", emoji: "🌿", ar: "شي أخضر", en: "Something green" },
  { key: "tea", emoji: "🍵", ar: "كاسة شاي", en: "A cup of tea" },
  { key: "desk", emoji: "💻", ar: "مكان شغلك أو دراستك", en: "Where you work or study" },
  { key: "family", emoji: "👨‍👩‍👧", ar: "لمّة العيلة", en: "Family time", tip: { ar: "مش لازم وجوه: الأيدي والسفرة تكفي.", en: "No faces needed: hands and the table are enough." } },
  { key: "sweet", emoji: "🍰", ar: "شي حلو", en: "Something sweet" },
  { key: "night", emoji: "🌙", ar: "ليلتك", en: "Your night" },
  { key: "handmade", emoji: "✋", ar: "شي عملته بإيديك", en: "Something you made" },
  { key: "market", emoji: "🛒", ar: "من السوق", en: "From the market" },
  { key: "red", emoji: "🔴", ar: "شي أحمر", en: "Something red" },
  { key: "old", emoji: "🕰️", ar: "شي قديم عندك", en: "Something old you own" },
  { key: "weather", emoji: "🌦️", ar: "الطقس اليوم", en: "Today's weather" },
  { key: "bread", emoji: "🥖", ar: "خبز اليوم", en: "Today's bread" },
  { key: "friend", emoji: "🤝", ar: "مع صاحبك", en: "With a friend" },
  { key: "road", emoji: "🚗", ar: "طريقك اليوم", en: "Your road today" },
  { key: "fruit", emoji: "🍉", ar: "فاكهة", en: "Fruit" },
  { key: "light", emoji: "💡", ar: "ضوء جميل", en: "Beautiful light" },
  { key: "kids", emoji: "🎈", ar: "شي يفرّح الأطفال", en: "Something kids love" },
  { key: "sport", emoji: "⚽", ar: "رياضتك", en: "Your sport" },
  { key: "friday", emoji: "🕌", ar: "جمعتنا", en: "Our Friday", tip: MOSQUE_TIP },
];

const BY_KEY = new Map(DAILY_THEMES.map((t) => [t.key, t]));
export const themeByKey = (key: string) => BY_KEY.get(key) ?? DAILY_THEMES[0];
export const themeText = (t: DailyTheme, locale: string) => (locale === "ar" ? t.ar : t.en);
