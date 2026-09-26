// Looks for a shot, chosen after upload. Nothing is re-encoded: `css` is applied when the
// shot is shown (grid, viewer, profile, Discover) and `ffmpeg` when a montage is made,
// so the owner can change or remove a look at any time. Keys are stored — add freely,
// never rename or remove one that has been used.

export type Filter = { key: string; ar: string; en: string; css: string; ffmpeg: string };

export const FILTERS: Filter[] = [
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
