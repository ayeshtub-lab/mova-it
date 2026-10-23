// «💌 بطاقة»: what a card can say and how it looks — shared by the editor (drawn on the phone,
// src/app/card/new/CardEditor.tsx) and the server (src/server/cards.ts checks what comes back).

// Out in the open: the «💌 اعملها بطاقة» button on shot pages, and card pages open to search
// (his OK after trying it, 2026-10-23: «اجعلها للكل»).
export const CARDS_PUBLIC = true;

export const CARD_KINDS = ["morning", "evening", "love", "wisdom", "friday", "other"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const isCardKind = (v: unknown): v is CardKind => typeof v === "string" && (CARD_KINDS as readonly string[]).includes(v);

export const CARD_TEXT_MAX = 140;

// A card's look is three choices (his call, 2026-10-23: more fonts made for pictures, and no band
// behind the words): the font, where the words sit, and their colour — kept as «font.place.colour».
// The words stay readable over any picture by a shadow and a thin outline.
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

export const CARD_PLACES = ["top", "center", "bottom"] as const;
export type CardPlace = (typeof CARD_PLACES)[number];

export const CARD_COLORS = { white: "#ffffff", gold: "#f6d27a", rose: "#ffc2d4", sky: "#bfe6ff", black: "#151515" } as const;
export type CardColor = keyof typeof CARD_COLORS;

export type CardStyle = { font: CardFont; weight: number; place: CardPlace; color: CardColor; hex: string };

export const DEFAULT_CARD_STYLE = "cairo.bottom.white";

// «ruqaa.center.gold» → its parts; anything unknown (an older card's look) → the default's.
export function cardStyle(key: string): CardStyle {
  const [f, p, c] = key.split(".");
  const font = CARD_FONTS.find((x) => x.key === f) ?? CARD_FONTS[0];
  const place = (CARD_PLACES as readonly string[]).includes(p) ? (p as CardPlace) : "bottom";
  const color = c && c in CARD_COLORS ? (c as CardColor) : "white";
  return { font: font.key, weight: font.weight, place, color, hex: CARD_COLORS[color] };
}
export const styleKey = (s: Pick<CardStyle, "font" | "place" | "color">) => `${s.font}.${s.place}.${s.color}`;
export const isCardStyle = (v: unknown): v is string => typeof v === "string" && styleKey(cardStyle(v)) === v;
