// The curated themes for «لحظة اليوم». People vote for tomorrow's theme from this
// list; nobody types free text, so a theme can never be offensive or an ad.
// Twenty follow the style of the world's longest-running daily photo challenge
// (FMS "Photo A Day", since 2012: short, evocative prompts with a one-line hint);
// ten are close to home. Keys are stored in the database — add new ones freely, but
// never rename or remove a key that has been used ("coffee" is).

type Text = { ar: string; en: string };
export type DailyTheme = { key: string; emoji: string; ar: string; en: string; hint: Text; tip?: Text };

const MOSQUE_TIP: Text = {
  ar: "صوّر المسجد والسماء والطريق، واحترم المصلّين: لا تصوّر أحدًا أثناء صلاته.",
  en: "Capture the mosque, the sky and the way there — and respect worshippers: never photograph anyone while they pray.",
};

export const DAILY_THEMES: DailyTheme[] = [
  // In the spirit of Photo A Day.
  { key: "feet", emoji: "👣", ar: "تحت قدميك", en: "Under your feet", hint: { ar: "نظرة لتحت: حذاءك، الأرض، أو اللي واقف عليه.", en: "A downward glance: your shoes, the ground, where you stand." } },
  { key: "joy", emoji: "😊", ar: "فرحة صغيرة", en: "A small joy", hint: { ar: "شي بسيط فرّحك اليوم: ابتسامة، شمس على الأرض، رسالة حلوة.", en: "Something simple that made you happy today." } },
  { key: "clouds", emoji: "☁️", ar: "أشكال في الغيوم", en: "Shapes in the clouds", hint: { ar: "ارفع راسك وتخيّل: تنّين؟ قلعة؟ القرار إلك.", en: "Look up and imagine: a dragon? a castle? You decide." } },
  { key: "shadow", emoji: "👤", ar: "ظلّك", en: "Your shadow", hint: { ar: "صوّر ظلّك: مرح، غامض، أو غير متوقع.", en: "Catch your shadow — playful, moody or unexpected." } },
  { key: "in-hand", emoji: "✋", ar: "في إيدك", en: "In your hand", hint: { ar: "امسك شي وصوّره: قهوة، وردة، أو سناك.", en: "Hold something and snap it: a coffee, a flower, a snack." } },
  { key: "cosy", emoji: "🛋️", ar: "ركنك المريح", en: "Your cosy corner", hint: { ar: "كنبة، زاوية، سرير: مكان يحضنك.", en: "A couch, a nook, a bed — a space that feels like a hug." } },
  { key: "detail", emoji: "🔍", ar: "تفصيلة صغيرة", en: "A tiny detail", hint: { ar: "شي صغير الكل بيفوّته، بس يستاهل تشوفه.", en: "Something small that's easy to miss, but worth noticing." } },
  { key: "kitchen", emoji: "🍳", ar: "في المطبخ", en: "In the kitchen", hint: { ar: "لحظة من مطبخك: طبخ، فوضى، أو أكل يريّح.", en: "A moment from your kitchen: cooking, chaos, comfort food." } },
  { key: "door", emoji: "🚪", ar: "باب", en: "A doorway", hint: { ar: "باب بتمرّ فيه كل يوم، أو بداية جديدة.", en: "A door you walk through every day — or a new beginning." } },
  { key: "look-up", emoji: "⬆️", ar: "انظر لفوق", en: "Look up", hint: { ar: "غيّر زاويتك: شو بتشوف لما ترفع عيونك؟", en: "Change your angle: what do you see above you?" } },
  { key: "green", emoji: "🌿", ar: "شي أخضر", en: "Something green", hint: { ar: "ورقة، نبتة، خضرة: أي شي أخضر وعايش.", en: "A leaf, a plant, a vegetable — anything green and growing." } },
  { key: "wall", emoji: "🖼️", ar: "على الحيط", en: "On the wall", hint: { ar: "لوحة، صور، رسمة أطفال، أو شي غريب معلّق.", en: "Art, photos, kids' drawings — or something unexpected." } },
  { key: "symmetry", emoji: "⚖️", ar: "تناظر", en: "Symmetry", hint: { ar: "دوّر على التوازن: صورة الجهتين فيها متشابهات.", en: "Look for balance: a snap where both sides match." } },
  { key: "home", emoji: "🏠", ar: "إحساس البيت", en: "Feels like home", hint: { ar: "شي يحسسك بالأمان: مكان، شخص، أو شعور.", en: "Whatever makes you feel safe: a place, a person, a feeling." } },
  { key: "last-photo", emoji: "📱", ar: "آخر صورة صوّرتها", en: "The last photo I took", hint: { ar: "افتح المعرض وشارك آخر صورة، بدون تفكير كثير!", en: "Open your gallery and share your last shot — no overthinking!" } },
  { key: "highlight", emoji: "⭐", ar: "أحلى شي صار اليوم", en: "Best thing today", hint: { ar: "شو كانت أحلى لحظة بيومك؟ كبيرة أو صغيرة.", en: "Today's highlight — big or tiny, it counts." } },
  { key: "sparkle", emoji: "✨", ar: "شي يلمع", en: "Something that sparkles", hint: { ar: "لمعة ضوء، زينة، أو قطرة مي.", en: "A glint of light, a shimmer, a drop of water." } },
  { key: "reflection", emoji: "🪞", ar: "انعكاسك", en: "Your reflection", hint: { ar: "في مراية، شباك، أو مي.", en: "In a mirror, a window, or water." } },
  { key: "calm-colour", emoji: "🎨", ar: "لون يريّحني", en: "A colour that calms me", hint: { ar: "لون هادي بيعطيك سلام.", en: "A gentle shade that brings you peace." } },
  { key: "comfort", emoji: "🤲", ar: "شي يريّحني", en: "Something that comforts me", hint: { ar: "كتاب، كنزة، شخص، أو فنجان.", en: "A book, a jumper, a person, a cup." } },
  // Close to home.
  { key: "coffee", emoji: "☕", ar: "قهوتك الصباحية", en: "Your morning coffee", hint: { ar: "فنجانك، كاستك، أو القهوة وهي تنصبّ.", en: "Your cup, your mug, or the coffee as it pours." } },
  { key: "tea", emoji: "🍵", ar: "كاسة شاي", en: "A cup of tea", hint: { ar: "شاي بالنعنع، كرك، أو شاي الضيوف.", en: "Mint tea, karak, or tea for the guests." } },
  { key: "fajr", emoji: "🕌", ar: "مسجد حيّك وقت الفجر", en: "Your local mosque at dawn", hint: { ar: "المسجد والسماء قبل ما تطلع الشمس.", en: "The mosque and the sky before sunrise." }, tip: MOSQUE_TIP },
  { key: "friday", emoji: "🕌", ar: "جمعتنا", en: "Our Friday", hint: { ar: "طريق الجمعة، غدا الجمعة، أو اللمّة بعد الصلاة.", en: "The way to Friday prayer, Friday lunch, the gathering after." }, tip: MOSQUE_TIP },
  { key: "family", emoji: "👨‍👩‍👧", ar: "لمّة العيلة", en: "Family time", hint: { ar: "السفرة، الضحك، الأيدي: مش لازم وجوه.", en: "The table, the laughter, the hands — no faces needed." } },
  { key: "sunset", emoji: "🌅", ar: "غروب اليوم", en: "Today's sunset", hint: { ar: "السماء لما الشمس تودّع.", en: "The sky as the sun says goodbye." } },
  { key: "meal", emoji: "🍽️", ar: "أكلة اليوم", en: "Today's meal", hint: { ar: "شو أكلت اليوم؟ صوّر الطبق قبل ما يخلص!", en: "What did you eat today? Snap it before it's gone!" } },
  { key: "window", emoji: "🪟", ar: "المنظر من شباكك", en: "The view from your window", hint: { ar: "شو بتشوف من شباكك هلأ؟", en: "What can you see from your window right now?" } },
  { key: "street", emoji: "🛣️", ar: "شارعك", en: "Your street", hint: { ar: "شارعك زي ما هو، بحياته اليومية.", en: "Your street as it is, in its everyday life." } },
  { key: "bread", emoji: "🥖", ar: "خبز اليوم", en: "Today's bread", hint: { ar: "خبز الفرن، الصاج، أو خبز البيت.", en: "From the bakery, the saj, or baked at home." } },
];

const BY_KEY = new Map(DAILY_THEMES.map((t) => [t.key, t]));
export const themeByKey = (key: string) => BY_KEY.get(key) ?? DAILY_THEMES[0];
export const themeText = (t: DailyTheme, locale: string) => (locale === "ar" ? t.ar : t.en);
export const themeHint = (t: DailyTheme, locale: string) => (locale === "ar" ? t.hint.ar : t.hint.en);
