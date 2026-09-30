// Looks for a shot, chosen after upload. Nothing is re-encoded: `css` is applied when the
// shot is shown (grid, viewer, profile, Discover) and `ffmpeg` when a montage is made,
// so the owner can change or remove a look at any time. Keys are stored — add freely,
// never rename or remove one that has been used.

export type Filter = { key: string; ar: string; en: string; css: string; ffmpeg: string };

export const FILTERS: Filter[] = [
  // «✨ تحسين»: light, contrast and colour lifted a little, sharpened — the default for new shots.
  { key: "auto", ar: "✨ تحسين", en: "✨ Enhance", css: "contrast(1.12) saturate(1.3) brightness(1.04)", ffmpeg: "eq=contrast=1.12:saturation=1.3:brightness=0.03,unsharp=5:5:0.8" },
  // The cinematic set: colour grades like films', not just a tint.
  { key: "golden", ar: "ساعة ذهبية", en: "Golden hour", css: "sepia(0.55) saturate(1.6) hue-rotate(-12deg) brightness(1.08) contrast(1.08)", ffmpeg: "colorbalance=rs=0.25:gs=0.08:bs=-0.25:rm=0.15:gm=0.03:bm=-0.15:rh=0.1:bh=-0.1,eq=saturation=1.35:contrast=1.08:brightness=0.04,vignette=PI/6" },
  { key: "teal", ar: "سينما حديثة", en: "Blockbuster", css: "contrast(1.22) saturate(1.2) hue-rotate(12deg) brightness(0.97)", ffmpeg: "colorbalance=rs=-0.2:gs=0.04:bs=0.32:rm=-0.12:gm=0.03:bm=0.12:rh=0.1:gh=0.0:bh=-0.04,eq=contrast=1.2:saturation=1.15" },
  { key: "film", ar: "فيلم", en: "Film", css: "contrast(0.92) saturate(0.7) sepia(0.35) brightness(1.02)", ffmpeg: "curves=all='0/0.08 0.5/0.52 1/0.92',eq=saturation=0.75:contrast=1.05,colorbalance=rs=0.06:bs=-0.04:rh=0.08:bh=-0.08,noise=alls=12:allf=t+u,vignette=PI/5" },
  { key: "night", ar: "ليل المدينة", en: "City night", css: "contrast(1.3) brightness(0.82) saturate(1.4) hue-rotate(28deg)", ffmpeg: "colorbalance=rs=-0.18:gs=-0.04:bs=0.32:rm=-0.14:bm=0.2:rh=-0.06:bh=0.12,eq=contrast=1.3:brightness=-0.1:saturation=1.3:gamma=0.85,vignette=PI/4" },
  { key: "noir", ar: "أبيض وأسود فني", en: "Noir", css: "grayscale(1) contrast(1.5) brightness(0.92)", ffmpeg: "hue=s=0,curves=preset=strong_contrast,vignette=PI/4" },
  { key: "warm", ar: "دافئ", en: "Warm", css: "sepia(0.22) saturate(1.3) hue-rotate(-8deg)", ffmpeg: "colorbalance=rs=0.08:gs=0.02:bs=-0.08,eq=saturation=1.25" },
  { key: "cool", ar: "بارد", en: "Cool", css: "saturate(1.1) hue-rotate(12deg) brightness(1.03)", ffmpeg: "colorbalance=rs=-0.06:bs=0.09,eq=brightness=0.02" },
  { key: "vivid", ar: "مشرق", en: "Vivid", css: "saturate(1.6) contrast(1.1)", ffmpeg: "eq=saturation=1.6:contrast=1.1" },
  { key: "bw", ar: "أبيض وأسود", en: "Black & white", css: "grayscale(1) contrast(1.12)", ffmpeg: "hue=s=0,eq=contrast=1.12" },
  { key: "vintage", ar: "قديم", en: "Vintage", css: "sepia(0.5) contrast(0.9) brightness(1.06) saturate(0.85)", ffmpeg: "curves=preset=vintage" },
  { key: "cinema", ar: "سينمائي", en: "Cinema", css: "contrast(1.22) saturate(0.85) brightness(0.95)", ffmpeg: "eq=contrast=1.22:saturation=0.85:brightness=-0.03" },
  { key: "rose", ar: "وردي", en: "Rose", css: "sepia(0.18) saturate(1.2) hue-rotate(-18deg) brightness(1.05)", ffmpeg: "colorbalance=rs=0.1:bs=0.05,eq=brightness=0.03:saturation=1.15" },
  { key: "fade", ar: "هادئ", en: "Soft", css: "contrast(0.88) brightness(1.08) saturate(0.8)", ffmpeg: "eq=contrast=0.88:brightness=0.05:saturation=0.8" },
];

const BY_KEY = new Map(FILTERS.map((f) => [f.key, f]));
export const filterByKey = (key: string | null | undefined) => (key ? (BY_KEY.get(key) ?? null) : null);
export const filterCss = (key: string | null | undefined) => filterByKey(key)?.css;
export const filterName = (f: Filter, locale: string) => (locale === "ar" ? f.ar : f.en);

// The retro date stamp: "٢٥ ٩ ٢٦  ٦:٤١ م" style, from when the shot was taken.
export function stampText(at: Date, locale: string, timeZone?: string) {
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone }).format(at);
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(at);
  return `${date}  ${time}`;
}
