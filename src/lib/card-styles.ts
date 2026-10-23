// «💌 بطاقة»: what a card can say and how it looks — shared by the editor (drawn on the phone,
// src/app/card/new/CardEditor.tsx) and the server (src/server/cards.ts checks what comes back).

// Out in the open: the «💌 اعملها بطاقة» button on shot pages, and card pages open to search. Off
// while he tries it on the live site by its link (2026-10-23, «انشرها مخفية»).
export const CARDS_PUBLIC = false;

export const CARD_KINDS = ["morning", "evening", "love", "wisdom", "friday", "other"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const isCardKind = (v: unknown): v is CardKind => typeof v === "string" && (CARD_KINDS as readonly string[]).includes(v);

export const CARD_TEXT_MAX = 140;

// The looks: the font (one of the three the editor loads), where the words sit, and how they
// stay readable over any picture — a shadow, or a soft band behind them.
export type CardStyle = {
  key: string;
  font: "cairo" | "amiri" | "kufi";
  weight: number;
  color: string;
  place: "top" | "center" | "bottom";
  band: boolean;
};

export const CARD_STYLES: CardStyle[] = [
  { key: "classic", font: "cairo", weight: 800, color: "#ffffff", place: "bottom", band: false },
  { key: "band", font: "cairo", weight: 700, color: "#ffffff", place: "bottom", band: true },
  { key: "poem", font: "amiri", weight: 700, color: "#ffffff", place: "center", band: false },
  { key: "gold", font: "amiri", weight: 700, color: "#f6d27a", place: "top", band: false },
  { key: "kufi", font: "kufi", weight: 700, color: "#ffffff", place: "center", band: true },
];
export const cardStyle = (key: string) => CARD_STYLES.find((s) => s.key === key) ?? CARD_STYLES[0];
export const isCardStyle = (v: unknown): v is string => typeof v === "string" && CARD_STYLES.some((s) => s.key === v);
