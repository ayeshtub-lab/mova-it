// Zawmo's sound library: sounds people can put on a photo, a video or a montage.
// Every file in public/sounds/ is public domain / CC0, CC BY (credit shown on the
// sound's page), or made by Zawmo (AI voice, pronunciation checked). Keys are stored
// in the database — add freely, never rename or remove a key that has been used.

export type SoundCategory = "nature" | "spiritual" | "wisdom" | "funny" | "warm" | "daf";
type Credit = { author: string; license: string; url: string };
export type Sound = { key: string; cat: SoundCategory; ar: string; en: string; seconds: number; credit: Credit | null };

const PD = "Public domain";
const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const SOUNDS: Sound[] = [
  { key: "n01", cat: "nature", ar: "عصافير الصباح", en: "Morning birds", seconds: 30, credit: { author: "stephan", license: PD, url: commons("Birdsong_mild_sunny_day.ogg") } },
  { key: "n02", cat: "nature", ar: "عصافير في الحديقة", en: "Birds in the garden", seconds: 30, credit: { author: "ezwa", license: PD, url: commons("Birds_singing_in_garden.ogg") } },
  { key: "n03", cat: "nature", ar: "تغريد العندليب", en: "Nightingale", seconds: 30, credit: { author: "Digweed1", license: "CC0", url: commons("Common_Nightingale%27s_song_2.ogg") } },
  { key: "n04", cat: "nature", ar: "الشحرور", en: "Blackbird", seconds: 30, credit: { author: "Diana Tudor", license: "CC BY 4.0", url: commons("Common_Blackbird_song_(Turdus_merula).ogg") } },
  { key: "n07", cat: "nature", ar: "مطر ورعد وعصافير", en: "Rain, thunder and birds", seconds: 30, credit: { author: "ezwa", license: PD, url: commons("Rain_thunder_and_birds.ogg") } },
  { key: "n08", cat: "nature", ar: "عاصفة رعدية", en: "Thunderstorm", seconds: 30, credit: { author: "stephan", license: PD, url: commons("Thunderstorm_after_hot_summer_day_17_minutes_01_of_04.ogg") } },
  { key: "n09", cat: "nature", ar: "جدول ماء", en: "A stream", seconds: 17.9, credit: { author: "stephan", license: PD, url: commons("Shallow_small_river_with_stony_riverbed.ogg") } },
  { key: "n10", cat: "nature", ar: "خرير الماء", en: "Flowing water", seconds: 30, credit: { author: "stephan", license: PD, url: commons("Water_flowing_pouring_trickling.ogg") } },
  { key: "n12", cat: "nature", ar: "نوارس البحر", en: "Seagulls", seconds: 18.2, credit: { author: "avphillips", license: PD, url: commons("Gull_1.ogg") } },
  { key: "n13", cat: "nature", ar: "نار الحطب", en: "Crackling fire", seconds: 25.5, credit: { author: "ezwa", license: PD, url: commons("Dry_grass_burning_in_open_fireplace.ogg") } },
  { key: "n15", cat: "nature", ar: "نسمة بين الشجر", en: "Breeze in the trees", seconds: 30, credit: { author: "nille", license: PD, url: commons("20090610_0_ambience.ogg") } },
  { key: "n16", cat: "nature", ar: "ليل البِركة", en: "Night by the pond", seconds: 30, credit: { author: "Glaneur de sons", license: "CC BY 3.0", url: commons("Nature_sounds_ambience_in_a_Dordogne_pond.ogg") } },
  { key: "n17", cat: "nature", ar: "خراف في المرعى", en: "Sheep in the field", seconds: 28.2, credit: { author: "earthcalling", license: PD, url: commons("Corner_of_a_sheep_field_in_summer.ogg") } },
  { key: "n18", cat: "nature", ar: "قطيع ماعز", en: "A herd of goats", seconds: 30, credit: { author: "stephan", license: PD, url: commons("Herd_of_goats_bleating.ogg") } },
  { key: "n19", cat: "nature", ar: "صياح الديك", en: "Rooster", seconds: 8.4, credit: { author: "alys", license: PD, url: commons("Medium_rooster_crowing.ogg") } },
  { key: "n14", cat: "warm", ar: "أجراس الريح", en: "Wind chimes", seconds: 30, credit: { author: "stephan", license: PD, url: commons("Windchime.ogg") } },
  { key: "s01", cat: "spiritual", ar: "سبحان الله وبحمده", en: "Subhan Allah wa bihamdih", seconds: 7, credit: null },
  { key: "s02", cat: "spiritual", ar: "أصبحنا وأصبح الملك لله", en: "Morning remembrance", seconds: 7.7, credit: null },
  { key: "s03", cat: "spiritual", ar: "اللهم بك أصبحنا", en: "Allahumma bika asbahna", seconds: 13.8, credit: null },
  { key: "s04", cat: "spiritual", ar: "لا إله إلا الله وحده لا شريك له", en: "La ilaha illa Allah", seconds: 13.2, credit: null },
  { key: "s05", cat: "spiritual", ar: "الصلاة على النبي ﷺ", en: "Blessings on the Prophet ﷺ", seconds: 7, credit: null },
  { key: "s06", cat: "spiritual", ar: "ما شاء الله تبارك الله", en: "Masha Allah, tabarak Allah", seconds: 4.6, credit: null },
  { key: "s07", cat: "spiritual", ar: "أستغفر الله العظيم", en: "Astaghfirullah", seconds: 5.6, credit: null },
  { key: "s08", cat: "spiritual", ar: "علمًا نافعًا ورزقًا طيبًا", en: "Beneficial knowledge, good provision", seconds: 10.6, credit: null },
  { key: "s09", cat: "spiritual", ar: "دعاء للعروسين", en: "A prayer for the newlyweds", seconds: 9.8, credit: null },
  { key: "s10", cat: "spiritual", ar: "الحمد لله الذي بنعمته تتم الصالحات", en: "Alhamdulillah for good news", seconds: 7.5, credit: null },
  { key: "s11", cat: "spiritual", ar: "تقبّل الله منا ومنكم", en: "Eid greeting", seconds: 7.5, credit: null },
  { key: "s12", cat: "wisdom", ar: "الصبر مفتاح الفرج", en: "Patience is the key", seconds: 9.6, credit: null },
  { key: "t03", cat: "funny", ar: "ههههه لا والله؟!", en: "Hahaha, no way?!", seconds: 2.7, credit: null },
  { key: "t04", cat: "funny", ar: "يا سلااام!", en: "Ya salaam!", seconds: 3.3, credit: null },
  { key: "t08", cat: "funny", ar: "أنا؟ لا والله مو أنا!", en: "Me? Not me!", seconds: 3.8, credit: null },
  { key: "f05", cat: "funny", ar: "جرس الباب", en: "Doorbell", seconds: 10, credit: { author: "Wikimedia Commons", license: PD, url: commons("Doorbell-classic-dingdong.ogg") } },
  { key: "d01", cat: "daf", ar: "إيقاع دف هادئ", en: "Calm frame drum", seconds: 30, credit: { author: "Anomyq", license: "CC0", url: commons("Oynak_(60_bpm).ogg") } },
  { key: "d02", cat: "daf", ar: "إيقاع دف متوسط", en: "Frame drum", seconds: 30, credit: { author: "Anomyq", license: "CC0", url: commons("Aksak_(90_bpm).ogg") } },
  { key: "d03", cat: "daf", ar: "إيقاع دف سريع", en: "Upbeat frame drum", seconds: 30, credit: { author: "Anomyq", license: "CC0", url: commons("Oynak_(120_bpm).ogg") } },
];

export const SOUND_CATEGORIES: { key: SoundCategory; emoji: string }[] = [
  { key: "nature", emoji: "🌿" },
  { key: "spiritual", emoji: "🤲" },
  { key: "wisdom", emoji: "📜" },
  { key: "funny", emoji: "😂" },
  { key: "warm", emoji: "🤍" },
  { key: "daf", emoji: "🥁" },
];

const BY_KEY = new Map(SOUNDS.map((s) => [s.key, s]));
export const soundByKey = (key: string | null | undefined) => (key ? (BY_KEY.get(key) ?? null) : null);
export const soundName = (s: Sound, locale: string) => (locale === "ar" ? s.ar : s.en);
export const soundFile = (key: string) => `/sounds/${key}.mp3`;
// Remembrance and wisdom are heard alone: a video's own sound is always muted under them.
export const isSolemn = (s: Sound | null) => s?.cat === "spiritual" || s?.cat === "wisdom";
// «Use this sound» on a sound's page leaves its key in the browser for the next upload.
export const PENDING_SOUND = "zawmo:sound";
