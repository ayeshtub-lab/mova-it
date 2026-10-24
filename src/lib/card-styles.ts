// «💌 بطاقة»: what a card can say and how it looks — shared by the editor (drawn on the phone,
// src/app/card/new/CardEditor.tsx) and the server (src/server/cards.ts checks what comes back).

// Out in the open: the «💌 اعملها بطاقة» button on shot pages, and card pages open to search
// (his OK after trying it, 2026-10-23: «اجعلها للكل»).
export const CARDS_PUBLIC = true;

export const CARD_KINDS = ["morning", "evening", "love", "wisdom", "friday", "coffee", "ramadan", "fitr", "adha", "mawlid", "other"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const isCardKind = (v: unknown): v is CardKind => typeof v === "string" && (CARD_KINDS as readonly string[]).includes(v);

// The occasions (his list, 2026-10-24): their lines are ready-made (the dictionary's card.ready),
// and each comes first on /cards and in the editor around its days — by the Hijri calendar.
export const OCCASIONS = ["ramadan", "fitr", "adha", "mawlid"] as const;
export const isOccasion = (k: string) => (OCCASIONS as readonly string[]).includes(k);
type Occasion = (typeof OCCASIONS)[number];
const HIJRI = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", day: "numeric", timeZone: "Asia/Hebron" });
// [from month, from day, to month, to day]: Ramadan from Shaban; Eid al-Fitr from mid-Ramadan; Eid
// al-Adha from the end of Dhu al-Qadah; the Mawlid from the end of Safar.
const SEASONS: Record<Occasion, [number, number, number, number]> = {
  ramadan: [8, 1, 9, 30],
  fitr: [9, 15, 10, 10],
  adha: [11, 20, 12, 13],
  mawlid: [2, 25, 3, 15],
};
export function occasionsNow(now = new Date()): Occasion[] {
  const parts = HIJRI.formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const at = month * 100 + day;
  return OCCASIONS.filter((o) => {
    const [fm, fd, tm, td] = SEASONS[o];
    return at >= fm * 100 + fd && at <= tm * 100 + td;
  });
}
// The kinds as tabs (without «other»): an occasion in its days first, then the everyday ones (the
// occasions out of season are kept together under «🎉 مناسبات», his ask 2026-10-24).
export function cardKindsNow(now = new Date()): Exclude<CardKind, "other">[] {
  const season = occasionsNow(now);
  const rest = CARD_KINDS.filter((k): k is Exclude<CardKind, "other"> => k !== "other" && !(season as string[]).includes(k));
  return [...season, ...rest];
}

export const CARD_TEXT_MAX = 140;

// A card's look (his calls, 2026-10-23/24): the font; the colour of the words (12); around them
// nothing (a soft shadow), an outline, or a soft band, in a colour of its own; and where they sit —
// dragged anywhere on the picture (x, y: the middle of the words, in % of the card), their size
// (% of the size that fits) and their tilt (degrees, like a stamp). Kept as
// «font.colour.frame.frameColour.x.y.size.tilt»; older cards' «font.place.colour» still read.
export const CARD_FONTS = [
  { key: "cairo", weight: 800 },
  { key: "ruqaa", weight: 700 },
  { key: "amiri", weight: 700 },
  { key: "messiri", weight: 700 },
  { key: "lalezar", weight: 400 },
  { key: "kufi", weight: 700 },
  { key: "rakkas", weight: 400 },
  { key: "marhey", weight: 600 },
  { key: "lemonada", weight: 600 },
  { key: "katibeh", weight: 400 },
] as const;
export type CardFont = (typeof CARD_FONTS)[number]["key"];

// Quick places (y of the words' middle), besides dragging.
export const CARD_PLACES = { top: 18, center: 50, bottom: 78 } as const;
export type CardPlace = keyof typeof CARD_PLACES;

export const CARD_COLORS = {
  white: "#ffffff",
  cream: "#fff1cc",
  gold: "#f6d27a",
  orange: "#ff9f43",
  red: "#ff4d5a",
  rose: "#ffc2d4",
  purple: "#c4a1ff",
  sky: "#bfe6ff",
  teal: "#2ed3c6",
  green: "#9be15d",
  navy: "#1d3a8a",
  black: "#151515",
} as const;
export type CardColor = keyof typeof CARD_COLORS;
const isColor = (v: string | undefined): v is CardColor => !!v && v in CARD_COLORS;
// The light colours, for the words around them (a light word gets a dark frame, and the other way).
export const lightColor = (c: CardColor) => c !== "navy" && c !== "black";

export const CARD_FRAMES = ["none", "outline", "band"] as const;
export type CardFrame = (typeof CARD_FRAMES)[number];

export const CARD_SIZE = { min: 50, max: 200 } as const;
export const CARD_TILT = 45;

export type CardStyle = {
  font: CardFont;
  weight: number;
  color: CardColor;
  hex: string;
  frame: CardFrame;
  frameColor: CardColor;
  frameHex: string;
  x: number;
  y: number;
  size: number;
  tilt: number;
};

export const DEFAULT_CARD_STYLE = "cairo.white.none.black.50.78.100.0";

const int = (v: string | undefined, min: number, max: number, fallback: number) => {
  const n = v !== undefined && /^-?\d{1,3}$/.test(v) ? Number(v) : fallback;
  return Math.min(max, Math.max(min, n));
};

// A look key → its parts; anything unknown → the default's.
export function cardStyle(key: string): CardStyle {
  const p = key.split(".");
  const font = CARD_FONTS.find((x) => x.key === p[0]) ?? CARD_FONTS[0];
  const legacy = p.length === 3;
  const color: CardColor = isColor(legacy ? p[2] : p[1]) ? ((legacy ? p[2] : p[1]) as CardColor) : "white";
  const frame: CardFrame = !legacy && (CARD_FRAMES as readonly string[]).includes(p[2]) ? (p[2] as CardFrame) : "none";
  const frameColor: CardColor = !legacy && isColor(p[3]) ? (p[3] as CardColor) : color === "black" ? "white" : "black";
  const y = legacy ? (CARD_PLACES[p[1] as CardPlace] ?? CARD_PLACES.bottom) : int(p[5], 5, 95, CARD_PLACES.bottom);
  return {
    font: font.key,
    weight: font.weight,
    color,
    hex: CARD_COLORS[color],
    frame,
    frameColor,
    frameHex: CARD_COLORS[frameColor],
    x: legacy ? 50 : int(p[4], 5, 95, 50),
    y,
    size: legacy ? 100 : int(p[6], CARD_SIZE.min, CARD_SIZE.max, 100),
    tilt: legacy ? 0 : int(p[7], -CARD_TILT, CARD_TILT, 0),
  };
}
export const styleKey = (s: Pick<CardStyle, "font" | "color" | "frame" | "frameColor" | "x" | "y" | "size" | "tilt">) =>
  [s.font, s.color, s.frame, s.frameColor, Math.round(s.x), Math.round(s.y), Math.round(s.size), Math.round(s.tilt)].join(".");
// (An editor left open across a deploy still sends the older three-part key.)
const LEGACY = /^[a-z]+\.(top|center|bottom)\.[a-z]+$/;
export const isCardStyle = (v: unknown): v is string =>
  typeof v === "string" && (styleKey(cardStyle(v)) === v || (LEGACY.test(v) && CARD_FONTS.some((f) => f.key === v.split(".")[0]) && isColor(v.split(".")[2])));
