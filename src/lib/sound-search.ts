import { lyricsOf } from "@/lib/lyrics";
import { soundByKey } from "@/lib/sounds";

// What a library sound adds to a shot's words for search: a natural phrase («مع تلاوة «فإن مع
// العسر يسرًا» من سورة الشرح») and two or three tags people really search for. Only words that are
// in the sound itself — its own text or name, or what it plainly is (a recitation, a duaa, birds
// singing): nothing invented, no name that isn't said. Shown with the shot's own line (its page,
// the moment's «📝 شو في باللحظة») and in its data for search engines; the shot itself is untouched.

type SoundSearch = { phrase: string; tags: string[] };

// Every library sound gets them by itself — a sound added later too — from its category and name
// (`automatic` below). Hand-picked here only where better words are in it than its name gives.
const PICKED: Record<string, SoundSearch> = {
  q02: { phrase: "مع تلاوة «فإن مع العسر يسرًا» من سورة الشرح", tags: ["إن_مع_العسر_يسرا", "سورة_الشرح"] },
  q04: { phrase: "مع تلاوة «ألا بذكر الله تطمئن القلوب» من سورة الرعد", tags: ["ألا_بذكر_الله_تطمئن_القلوب", "راحة_نفسية"] },
  q06: { phrase: "مع تلاوة «فبأي آلاء ربكما تكذبان» من سورة الرحمن", tags: ["سورة_الرحمن", "فبأي_آلاء_ربكما_تكذبان"] },
  q14: { phrase: "مع تلاوة «فإني قريب أجيب دعوة الداع» من سورة البقرة", tags: ["أجيب_دعوة_الداع", "دعاء"] },
  q15: { phrase: "مع تلاوة سورة الإخلاص", tags: ["سورة_الإخلاص", "قل_هو_الله_أحد"] },
  q16: { phrase: "مع تلاوة آية الكرسي", tags: ["آية_الكرسي", "قرآن_كريم"] },
  q17: { phrase: "مع تلاوة سورة الشرح", tags: ["سورة_الشرح", "ألم_نشرح_لك_صدرك"] },
  q19: { phrase: "مع تلاوة سورة قريش", tags: ["سورة_قريش", "قرآن_كريم"] },
  q20: { phrase: "مع تلاوة سورة الفلق", tags: ["سورة_الفلق", "قل_أعوذ_برب_الفلق"] },
  q31: { phrase: "مع تلاوة «تبارك الذي بيده الملك» من سورة الملك", tags: ["سورة_الملك", "تبارك_الذي_بيده_الملك"] },
  q41: { phrase: "مع تلاوة «لا إله إلا أنت سبحانك» من سورة الأنبياء", tags: ["دعاء_يونس", "لا_إله_إلا_أنت_سبحانك"] },
  q48: { phrase: "مع تلاوة «اقرأ باسم ربك» من سورة العلق", tags: ["سورة_العلق", "اقرأ_باسم_ربك"] },
  s01: { phrase: "مع ذكر «سبحان الله وبحمده، سبحان الله العظيم»", tags: ["سبحان_الله_وبحمده", "أذكار"] },
  s02: { phrase: "مع ذكر «أصبحنا وأصبح الملك لله»", tags: ["أذكار_الصباح", "أصبحنا_وأصبح_الملك_لله"] },
  s03: { phrase: "مع ذكر «اللهم بك أصبحنا وبك أمسينا»", tags: ["أذكار_الصباح", "أذكار_المساء"] },
  s04: { phrase: "مع ذكر «لا إله إلا الله وحده لا شريك له»", tags: ["لا_إله_إلا_الله", "أذكار"] },
  s05: { phrase: "مع الصلاة على النبي ﷺ", tags: ["الصلاة_على_النبي", "اللهم_صل_على_محمد"] },
  s06: { phrase: "مع «ما شاء الله تبارك الله»", tags: ["ما_شاء_الله", "تبارك_الله"] },
  s07: { phrase: "مع «أستغفر الله العظيم وأتوب إليه»", tags: ["استغفار", "أستغفر_الله"] },
  s08: { phrase: "مع دعاء «علمًا نافعًا ورزقًا طيبًا»", tags: ["دعاء_الرزق", "رزقا_طيبا"] },
  s09: { phrase: "مع دعاء للعروسين «بارك الله لكما»", tags: ["دعاء_للعروسين", "بارك_الله_لكما"] },
  s10: { phrase: "مع «الحمد لله الذي بنعمته تتم الصالحات»", tags: ["الحمد_لله", "بنعمته_تتم_الصالحات"] },
  s11: { phrase: "مع «تقبّل الله منا ومنكم، وكل عام وأنتم بخير»", tags: ["تقبل_الله_منا_ومنكم", "كل_عام_وأنتم_بخير"] },
  s12: { phrase: "مع حكمة «الصبر مفتاح الفرج، ومن جدّ وجد»", tags: ["الصبر_مفتاح_الفرج", "حكمة", "من_جد_وجد"] },
  s14: { phrase: "مع دعاء «اللهم اجعلني شكورًا واجعلني صبورًا»", tags: ["دعاء", "اللهم_اجعلني_شكورا"] },
  s16: { phrase: "مع دعاء «اللهم ارفع ذكري وضع وزري»", tags: ["دعاء", "ارفع_ذكري"] },
  s18: { phrase: "مع دعاء «اللهم إني أعوذ بك من الجوع»", tags: ["دعاء", "أعوذ_بك_من_الجوع"] },
  s19: { phrase: "مع دعاء «اللهم أنت الأول فليس قبلك شيء»", tags: ["دعاء", "اللهم_أنت_الأول"] },
  s21: { phrase: "مع دعاء الكرب «لا إله إلا الله الحليم الكريم»", tags: ["دعاء_الكرب", "لا_إله_إلا_الله_الحليم_الكريم"] },
  h01: { phrase: "على أنشودة «عليك سلام» — صلى عليك الله يا خير الأنام", tags: ["الصلاة_على_النبي", "أناشيد_إسلامية"] },
  h02: { phrase: "على أنشودة «عليك سلام» — صلى عليك الله يا خير الأنام", tags: ["الصلاة_على_النبي", "أناشيد_إسلامية"] },
  h03: { phrase: "على أنشودة «في مديح الهادي» — صلى عليك الله يا خير الورى", tags: ["مديح_النبي", "أناشيد_إسلامية"] },
  h04: { phrase: "على أنشودة «دعاء أمي»", tags: ["دعاء_الأم", "أمي", "أناشيد_إسلامية"] },
  h05: { phrase: "على أنشودة «أمي» — يا أمي يا دفء الدنيا", tags: ["أمي", "يا_أمي", "أناشيد_إسلامية"] },
  n01: { phrase: "على صوت العصافير الصبح", tags: ["صوت_العصافير", "صباح"] },
  n02: { phrase: "على صوت العصافير بالحديقة", tags: ["صوت_العصافير", "حديقة"] },
  n03: { phrase: "على تغريد العندليب", tags: ["صوت_العندليب", "تغريد"] },
  n04: { phrase: "على صوت الشحرور", tags: ["صوت_الشحرور", "تغريد"] },
  n07: { phrase: "على صوت المطر والرعد", tags: ["صوت_المطر", "مطر"] },
  n08: { phrase: "على صوت عاصفة رعدية", tags: ["صوت_الرعد", "عاصفة"] },
  n09: { phrase: "على صوت جدول الماء", tags: ["صوت_الماء", "خرير_الماء"] },
  n10: { phrase: "على صوت خرير الماء", tags: ["خرير_الماء", "صوت_الماء"] },
  n12: { phrase: "على صوت البحر والنوارس", tags: ["صوت_البحر", "نوارس"] },
  n13: { phrase: "على صوت نار الحطب", tags: ["نار_الحطب", "شتاء"] },
  n15: { phrase: "على صوت النسمة بين الشجر", tags: ["صوت_الطبيعة", "هدوء"] },
  n17: { phrase: "على صوت خراف بالمرعى", tags: ["خراف", "مرعى"] },
  n18: { phrase: "على صوت قطيع ماعز", tags: ["ماعز", "مرعى"] },
  n19: { phrase: "على صياح الديك", tags: ["صياح_الديك", "صباح"] },
  e01: { phrase: "على صوت زغرودة", tags: ["زغرودة", "زغاريد"] },
  e02: { phrase: "على صوت زغرودة", tags: ["زغرودة", "زغاريد"] },
  e03: { phrase: "على صوت زفة سيارات", tags: ["زفة", "عرس"] },
  e04: { phrase: "على طبل وأهازيج عرس", tags: ["أهازيج_عرس", "زفة"] },
  e05: { phrase: "على إيقاع دربكة", tags: ["دربكة", "إيقاع"] },
  e06: { phrase: "على صوت ألعاب نارية", tags: ["ألعاب_نارية", "احتفال"] },
  m06: { phrase: "على تقاسيم عود", tags: ["عود", "تقاسيم_عود"] },
};

const NO_MARKS = /[ً-ٰٟ]/g; // tashkeel: tags are typed without it

const asTag = (text: string) =>
  text
    .replace(/[«»"()؟?!.،,:]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("_")
    .replace(NO_MARKS, "");

// From the sound's category and name. «الضحى: وأما بنعمة ربك فحدّث» → «مع تلاوة «…» من سورة الضحى»,
// #سورة_الضحى; a duaa → «مع «…»», #…, #دعاء; birds → «على صوت عصافير الصباح». Null: nothing worth
// searching for (a funny line; a person's own sound — its name is theirs to give).
function automatic(key: string): SoundSearch | null {
  const sound = soundByKey(key);
  if (!sound) return null;
  const name = sound.ar.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  switch (sound.cat) {
    case "quran": {
      const [surah, words] = sound.ar.split(/:\s*/);
      if (!words) return { phrase: `مع تلاوة ${sound.ar}`, tags: [asTag(sound.ar), "قرآن_كريم"] };
      return { phrase: `مع تلاوة «${words}» من سورة ${surah}`, tags: [`سورة_${asTag(surah)}`, "قرآن_كريم"] };
    }
    case "spiritual":
      return { phrase: `مع «${name}»`, tags: [asTag(name), name.startsWith("اللهم") || name.startsWith("دعاء") ? "دعاء" : "أذكار"] };
    case "wisdom":
      return { phrase: `مع حكمة «${name}»`, tags: [asTag(name), "حكمة"] };
    case "nasheed":
      return { phrase: `على أنشودة «${name}»`, tags: [asTag(name), "أناشيد_إسلامية"] };
    case "nature":
    case "warm":
      return { phrase: `على صوت ${name}`, tags: [asTag(name), "أصوات_الطبيعة"] };
    case "occasions":
      return { phrase: `على صوت ${name}`, tags: [asTag(name), "مناسبات"] };
    case "calm":
    case "daf":
      return { phrase: `على ${name}`, tags: [asTag(name)] };
    default:
      return null;
  }
}

export function soundSearch(key: string | null | undefined): (SoundSearch & { words: string | null }) | null {
  if (!key) return null;
  const found = PICKED[key] ?? automatic(key);
  if (!found) return null;
  // The words heard, in order (a verse's own text; a duaa's, a nasheed's) — for a video's transcript.
  const words = lyricsOf(key)?.lines.map((l) => l[2]).join(" ") ?? null;
  return { ...found, tags: found.tags.map((t) => t.replace(NO_MARKS, "")), words };
}
