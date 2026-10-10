// Zawmo's sound library: sounds people can put on a photo, a video or a montage.
// Every file in public/sounds/ is public domain / CC0, CC BY (credit shown on the
// sound's page), or made by Zawmo. Calm music («هادية») is CC0 or public domain only, and
// never from libraries that fingerprint their music (YouTube Content ID): people share
// their videos everywhere, and a claim must never land on them (AI voice, pronunciation checked). Quran verses are
// Sheikh Mishary Alafasy's recitation from MP3Quran.net (its site states its rights are
// open to all, commercial use included), cut on MP3Quran's official verse timings and
// otherwise untouched. Keys are stored in the database — add freely, never rename or
// remove a key that has been used.

export type SoundCategory = "quran" | "nature" | "spiritual" | "nasheed" | "wisdom" | "funny" | "warm" | "daf" | "calm" | "occasions" | "people";
type Credit = { author: string; license: string; url: string };
export type Sound = { key: string; cat: SoundCategory; ar: string; en: string; seconds: number; credit: Credit | null };

const PD = "Public domain";
const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;
const AFASY: Credit = { author: "الشيخ مشاري العفاسي", license: "MP3Quran.net", url: "https://www.mp3quran.net/ar/afs" };

export const SOUNDS: Sound[] = [
  { key: "q01", cat: "quran", ar: "الضحى: وأما بنعمة ربك فحدّث", en: "Ad-Duha 11", seconds: 5.4, credit: AFASY },
  { key: "q02", cat: "quran", ar: "الشرح: فإن مع العسر يسرًا", en: "Ash-Sharh 5–6", seconds: 9, credit: AFASY },
  { key: "q03", cat: "quran", ar: "إبراهيم: لئن شكرتم لأزيدنكم", en: "Ibrahim 7", seconds: 15.4, credit: AFASY },
  { key: "q04", cat: "quran", ar: "الرعد: ألا بذكر الله تطمئن القلوب", en: "Ar-Ra'd 28", seconds: 18.4, credit: AFASY },
  { key: "q05", cat: "quran", ar: "النمل: صُنع الله الذي أتقن كل شيء", en: "An-Naml 88", seconds: 23.5, credit: AFASY },
  { key: "q06", cat: "quran", ar: "الرحمن: فبأي آلاء ربكما تكذبان", en: "Ar-Rahman 13", seconds: 9.5, credit: AFASY },
  { key: "q07", cat: "quran", ar: "آل عمران: إن في خلق السماوات والأرض", en: "Al Imran 190", seconds: 13.9, credit: AFASY },
  { key: "q08", cat: "quran", ar: "ق: وأنبتنا فيها من كل زوج بهيج", en: "Qaf 7", seconds: 15.7, credit: AFASY },
  { key: "q09", cat: "quran", ar: "الإسراء: وقرآن الفجر كان مشهودًا", en: "Al-Isra 78", seconds: 14.5, credit: AFASY },
  { key: "q10", cat: "quran", ar: "الروم: وجعل بينكم مودة ورحمة", en: "Ar-Rum 21", seconds: 28.6, credit: AFASY },
  { key: "q11", cat: "quran", ar: "الفرقان: هب لنا من أزواجنا وذرياتنا قرة أعين", en: "Al-Furqan 74", seconds: 16.3, credit: AFASY },
  { key: "q12", cat: "quran", ar: "النحل: وإن تعدّوا نعمة الله لا تحصوها", en: "An-Nahl 18", seconds: 12.7, credit: AFASY },
  { key: "q13", cat: "quran", ar: "الزخرف: سبحان الذي سخّر لنا هذا", en: "Az-Zukhruf 13–14", seconds: 32.6, credit: AFASY },
  { key: "q14", cat: "quran", ar: "البقرة: فإني قريب أجيب دعوة الداع", en: "Al-Baqarah 186", seconds: 24.2, credit: AFASY },
  { key: "q15", cat: "quran", ar: "سورة الإخلاص", en: "Al-Ikhlas", seconds: 13.2, credit: AFASY },
  { key: "q16", cat: "quran", ar: "آية الكرسي", en: "Ayat al-Kursi", seconds: 54.2, credit: AFASY },
  { key: "q17", cat: "quran", ar: "سورة الشرح", en: "Ash-Sharh", seconds: 33.84, credit: AFASY },
  { key: "q18", cat: "quran", ar: "الضحى: ما ودّعك ربك وما قلى", en: "Ad-Duha 1–8", seconds: 39.12, credit: AFASY },
  { key: "q19", cat: "quran", ar: "سورة قريش", en: "Quraysh", seconds: 33.58, credit: AFASY },
  { key: "q20", cat: "quran", ar: "سورة الفلق", en: "Al-Falaq", seconds: 23.72, credit: AFASY },
  { key: "q21", cat: "quran", ar: "الشمس: والشمس وضحاها", en: "Ash-Shams 1–7", seconds: 28.48, credit: AFASY },
  { key: "q22", cat: "quran", ar: "النبأ: ألم نجعل الأرض مهادًا", en: "An-Naba 6–11", seconds: 24.44, credit: AFASY },
  { key: "q23", cat: "quran", ar: "النبأ: وأنزلنا من المعصرات ماءً ثجّاجًا", en: "An-Naba 12–16", seconds: 31.6, credit: AFASY },
  { key: "q24", cat: "quran", ar: "إبراهيم: رب اجعلني مقيم الصلاة", en: "Ibrahim 40–41", seconds: 24.86, credit: AFASY },
  { key: "q25", cat: "quran", ar: "الزمر: لا تقنطوا من رحمة الله", en: "Az-Zumar 53", seconds: 28.78, credit: AFASY },
  { key: "q26", cat: "quran", ar: "الحجرات: وجعلناكم شعوبًا وقبائل لتعارفوا", en: "Al-Hujurat 13", seconds: 35.72, credit: AFASY },
  { key: "q27", cat: "quran", ar: "النحل: وهو الذي سخّر البحر", en: "An-Nahl 14", seconds: 36.22, credit: AFASY },
  { key: "q28", cat: "quran", ar: "الكهف: ربنا آتنا من لدنك رحمة", en: "Al-Kahf 10", seconds: 23.32, credit: AFASY },
  { key: "q29", cat: "quran", ar: "لقمان: أن اشكر لي ولوالديك", en: "Luqman 14", seconds: 31.86, credit: AFASY },
  { key: "q30", cat: "quran", ar: "آل عمران: ربنا لا تزغ قلوبنا", en: "Al Imran 8–9", seconds: 35.3, credit: AFASY },
  { key: "q31", cat: "quran", ar: "الملك: تبارك الذي بيده الملك", en: "Al-Mulk 1–2", seconds: 24.12, credit: AFASY },
  { key: "q32", cat: "quran", ar: "الملك: ما ترى في خلق الرحمن من تفاوت", en: "Al-Mulk 3–4", seconds: 31.92, credit: AFASY },
  { key: "q33", cat: "quran", ar: "الغاشية: أفلا ينظرون إلى الإبل كيف خُلقت", en: "Al-Ghashiyah 17–21", seconds: 26.54, credit: AFASY },
  { key: "q34", cat: "quran", ar: "ق: ونزّلنا من السماء ماءً مباركًا", en: "Qaf 9–10", seconds: 28.58, credit: AFASY },
  { key: "q35", cat: "quran", ar: "آل عمران: قل اللهم مالك الملك", en: "Al Imran 26", seconds: 37.74, credit: AFASY },
  { key: "q36", cat: "quran", ar: "النحل: يُنبت لكم به الزرع والزيتون", en: "An-Nahl 11", seconds: 23.78, credit: AFASY },
  { key: "q37", cat: "quran", ar: "النحل: فيه شفاء للناس", en: "An-Nahl 69", seconds: 32.94, credit: AFASY },
  { key: "q38", cat: "quran", ar: "الرحمن: مرج البحرين يلتقيان", en: "Ar-Rahman 19–22", seconds: 27.88, credit: AFASY },
  { key: "q39", cat: "quran", ar: "الإنسان: ويطعمون الطعام على حبه", en: "Al-Insan 8–10", seconds: 29.3, credit: AFASY },
  { key: "q40", cat: "quran", ar: "البقرة: فاذكروني أذكركم", en: "Al-Baqarah 152–153", seconds: 25.88, credit: AFASY },
  { key: "q41", cat: "quran", ar: "الأنبياء: لا إله إلا أنت سبحانك", en: "Al-Anbiya 87–88", seconds: 38.02, credit: AFASY },
  { key: "q42", cat: "quran", ar: "هود: وما من دابة إلا على الله رزقها", en: "Hud 6", seconds: 24.46, credit: AFASY },
  { key: "q43", cat: "quran", ar: "الشعراء: الذي خلقني فهو يهدين", en: "Ash-Shu'ara 78–82", seconds: 32.5, credit: AFASY },
  { key: "q44", cat: "quran", ar: "إبراهيم: كلمة طيبة كشجرة طيبة", en: "Ibrahim 24–25", seconds: 39.58, credit: AFASY },
  { key: "q45", cat: "quran", ar: "النمل: رب أوزعني أن أشكر نعمتك", en: "An-Naml 19", seconds: 34.38, credit: AFASY },
  { key: "q46", cat: "quran", ar: "الرعد: وهو الذي مدّ الأرض", en: "Ar-Ra'd 3", seconds: 33.2, credit: AFASY },
  { key: "q47", cat: "quran", ar: "سبأ: اعملوا آل داود شكرًا", en: "Saba 13", seconds: 26.22, credit: AFASY },
  { key: "q48", cat: "quran", ar: "العلق: اقرأ باسم ربك", en: "Al-Alaq 1–5", seconds: 21.22, credit: AFASY },
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
  // Duaas recorded for Zawmo (an AI voice, its wording checked word by word) over a soft drone and a
  // public-domain/CC0 nature sound from this library; each 40 s at most.
  { key: "s14", cat: "spiritual", ar: "اللهم اجعلني شكورًا", en: "O Allah, make me grateful", seconds: 19.3, credit: null },
  { key: "s16", cat: "spiritual", ar: "اللهم ارفع ذكري وضع وزري", en: "Raise my mention, lift my burden", seconds: 29.5, credit: null },
  { key: "s18", cat: "spiritual", ar: "أعوذ بك من الجوع والخيانة", en: "Refuge from hunger and betrayal", seconds: 20.2, credit: null },
  { key: "s19", cat: "spiritual", ar: "اللهم أنت الأول فليس قبلك شيء", en: "You are the First", seconds: 40, credit: null },
  { key: "s21", cat: "spiritual", ar: "دعاء الكرب", en: "Duaa in distress", seconds: 23.3, credit: null },
  // Nasheeds made for Zawmo: our own words, a new melody generated with Google Lyria (checked
  // against the song that inspired its feel: no shared melody or words); each 40 s at most.
  { key: "h01", cat: "nasheed", ar: "عليكَ سلامْ (ابتسامته)", en: "Peace be upon you (his smile)", seconds: 39.2, credit: null },
  { key: "h02", cat: "nasheed", ar: "عليكَ سلامْ (طَيبة)", en: "Peace be upon you (Taybah)", seconds: 39.2, credit: null },
  { key: "h03", cat: "nasheed", ar: "في مديح الهادي", en: "In praise of the Guide", seconds: 39.8, credit: null },
  { key: "h04", cat: "nasheed", ar: "دُعاءُ أُمّي", en: "My mother's prayer", seconds: 39.4, credit: null },
  { key: "h05", cat: "nasheed", ar: "أُمّي (الأمان)", en: "My mother (safety)", seconds: 39.8, credit: null },
  { key: "s12", cat: "wisdom", ar: "الصبر مفتاح الفرج", en: "Patience is the key", seconds: 9.6, credit: null },
  { key: "t03", cat: "funny", ar: "ههههه لا والله؟!", en: "Hahaha, no way?!", seconds: 2.7, credit: null },
  { key: "t04", cat: "funny", ar: "يا سلااام!", en: "Ya salaam!", seconds: 3.3, credit: null },
  { key: "t08", cat: "funny", ar: "أنا؟ لا والله مو أنا!", en: "Me? Not me!", seconds: 3.8, credit: null },
  { key: "f05", cat: "funny", ar: "جرس الباب", en: "Doorbell", seconds: 10, credit: { author: "Wikimedia Commons", license: PD, url: commons("Doorbell-classic-dingdong.ogg") } },
  { key: "d01", cat: "daf", ar: "إيقاع دف هادئ", en: "Calm frame drum", seconds: 30, credit: { author: "Anomyq", license: "CC0", url: commons("Oynak_(60_bpm).ogg") } },
  { key: "d02", cat: "daf", ar: "إيقاع دف متوسط", en: "Frame drum", seconds: 30, credit: { author: "Anomyq", license: "CC0", url: commons("Aksak_(90_bpm).ogg") } },
  { key: "m06", cat: "calm", ar: "تقاسيم عود", en: "Oud taqsim", seconds: 20.4, credit: { author: "kafokafo", license: "CC0", url: "https://freesound.org/people/kafokafo/sounds/128355/" } },
  { key: "m07", cat: "calm", ar: "شوبان: نوكتورن", en: "Chopin: Nocturne Op. 9 No. 2", seconds: 30, credit: { author: "Frank Levy · Musopen", license: PD, url: commons("Nocturne_in_E_flat_major,_Op._9_no._2.mp3") } },
  { key: "m08", cat: "calm", ar: "شومان: أحلام", en: "Schumann: Träumerei", seconds: 30, credit: { author: "Donald Betts · Musopen", license: PD, url: commons("Robert_Schumann_-_scenes_from_childhood,_op._15_-_vii._dreaming.ogg") } },
  { key: "m01", cat: "calm", ar: "هدوء الصبح", en: "Quiet morning", seconds: 30, credit: { author: "Alex McCulloch", license: "CC0", url: "https://opengameart.org/content/just-you-and-me-guitar" } },
  { key: "m02", cat: "calm", ar: "سكون", en: "Stillness", seconds: 30, credit: { author: "The Cynic Project", license: "CC0", url: "https://opengameart.org/content/calm-piano-1-vaporware" } },
  { key: "m03", cat: "calm", ar: "بيانو هادي (ساتي)", en: "Gymnopédie No. 1 (Satie)", seconds: 30, credit: { author: "Robin Alciatore · Musopen", license: PD, url: commons("Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg") } },
  { key: "m04", cat: "calm", ar: "رواق الصبح", en: "Cozy morning", seconds: 30, credit: { author: "Cakeflaps", license: "CC0", url: "https://opengameart.org/content/good-morning" } },
  { key: "m05", cat: "calm", ar: "حالم", en: "Dreamy", seconds: 30, credit: { author: "Joth", license: "CC0", url: "https://opengameart.org/content/contemplation-0" } },
  // «مناسبات»: real recordings (CC0, Freesound) — zaghrouta, a Ramallah car zaffe, wedding drums.
  { key: "e01", cat: "occasions", ar: "زغرودة", en: "Zaghrouta", seconds: 7.1, credit: { author: "Slimane27", license: "CC0", url: "https://freesound.org/people/Slimane27/sounds/687474/" } },
  { key: "e02", cat: "occasions", ar: "زغرودة «يويو»", en: "Yoyo ululation", seconds: 6.2, credit: { author: "Slimane27", license: "CC0", url: "https://freesound.org/people/Slimane27/sounds/687473/" } },
  { key: "e03", cat: "occasions", ar: "زفة سيارات (رام الله)", en: "Wedding car zaffe (Ramallah)", seconds: 25, credit: { author: "sounds_from_palestine", license: "CC0", url: "https://freesound.org/people/sounds_from_palestine/sounds/819767/" } },
  { key: "e04", cat: "occasions", ar: "طبل وأهازيج عرس", en: "Wedding drums and chants", seconds: 30, credit: { author: "Dunny45", license: "CC0", url: "https://freesound.org/people/Dunny45/sounds/580678/" } },
  { key: "e05", cat: "occasions", ar: "إيقاع دربكة مقسوم", en: "Darbuka maqsoum", seconds: 15.1, credit: { author: "nemaavla", license: "CC0", url: "https://freesound.org/people/nemaavla/sounds/510745/" } },
  { key: "e06", cat: "occasions", ar: "ألعاب نارية", en: "Fireworks", seconds: 25, credit: { author: "redcrow1973", license: "CC0", url: "https://freesound.org/people/redcrow1973/sounds/190700/" } },
  { key: "e07", cat: "occasions", ar: "تصفيق وهتاف", en: "Cheering and clapping", seconds: 14.2, credit: { author: "AlaskaRobotics", license: "CC0", url: "https://freesound.org/people/AlaskaRobotics/sounds/221568/" } },
  { key: "d03", cat: "daf", ar: "إيقاع دف سريع", en: "Upbeat frame drum", seconds: 30, credit: { author: "Anomyq", license: "CC0", url: commons("Oynak_(120_bpm).ogg") } },
];

// In this order in the sound picker (the owner's choice, 2026-10-10): Quran, nasheeds, nature,
// remembrance, occasions — then the rest. The first one opens by default.
export const SOUND_CATEGORIES: { key: SoundCategory; emoji: string }[] = [
  { key: "quran", emoji: "🕋" },
  { key: "nasheed", emoji: "🎙️" },
  { key: "nature", emoji: "🌿" },
  { key: "spiritual", emoji: "🤲" },
  { key: "occasions", emoji: "🎉" },
  { key: "people", emoji: "🎤" },
  { key: "wisdom", emoji: "📜" },
  { key: "funny", emoji: "😂" },
  { key: "warm", emoji: "🤍" },
  { key: "daf", emoji: "🥁" },
  { key: "calm", emoji: "🎵" },
];

const BY_KEY = new Map(SOUNDS.map((s) => [s.key, s]));
// «🎤 صوتك الأصلي»: a sound someone made public from their video (src/server/user-sounds.ts).
export const isPeopleKey = (key: string | null | undefined) => !!key && /^u[0-9a-f]{12}$/.test(key);
// Its name and owner live in the database (its page shows them); everywhere else it plays
// like any library sound, under this generic name.
const peopleSound = (key: string): Sound => ({ key, cat: "people", ar: "🎤 صوت أصلي", en: "🎤 Original sound", seconds: 30, credit: null });
export const soundByKey = (key: string | null | undefined) => (key ? (BY_KEY.get(key) ?? (isPeopleKey(key) ? peopleSound(key) : null)) : null);
export const soundName = (s: Sound, locale: string) => (locale === "ar" ? s.ar : s.en);
export const soundFile = (key: string) => (isPeopleKey(key) ? `/sounds/u/${key}.mp3` : `/sounds/${key}.mp3`);
// Quran, remembrance, nasheeds and wisdom are heard alone: a video's own sound is always muted under them.
export const isSolemn = (s: Sound | null) => s?.cat === "quran" || s?.cat === "spiritual" || s?.cat === "nasheed" || s?.cat === "wisdom";
// A verse is heard once, never looped, and never cut short.
export const isQuran = (s: Sound | null) => s?.cat === "quran";
// «Use this sound» on a sound's page leaves its key in the browser for the next upload.
export const PENDING_SOUND = "zawmo:sound";
