// Writing on a shot (text with emoji). The owner's phone draws it into a transparent PNG
// (so emoji look the same everywhere, montages included); it is laid on a 9:16 frame,
// centred across, its middle at `y` of the height and `w` of the width wide. The shot's
// file is never changed: the writing can be edited or removed at any time.

// How it was drawn, so the owner can reopen and edit it as it was.
export type CaptionStyle = { colour: string; pill: boolean; size: number };
export type Caption = { text: string; path: string; y: number; w: number; style?: CaptionStyle };
export type CaptionView = { text: string; url: string; y: number; w: number; style?: CaptionStyle };

export const CAPTION_COLOURS = ["#ffffff", "#1f1a17", "#ffbf1f", "#e63946", "#2f6fed", "#ff7eb6"];

export function parseStyle(raw: unknown): CaptionStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.colour !== "string" || !CAPTION_COLOURS.includes(s.colour) || typeof s.pill !== "boolean" || ![0, 1, 2].includes(s.size as number)) return undefined;
  return { colour: s.colour, pill: s.pill, size: s.size as number };
}

export const CAPTION_MAX = 120;
// Where the writing may sit: clear of the very top and bottom edges.
export const CAPTION_Y = { min: 0.08, max: 0.92 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parseCaption(raw: unknown): Caption | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.text !== "string" || typeof c.path !== "string" || typeof c.y !== "number" || typeof c.w !== "number") return null;
  return { text: c.text, path: c.path, y: clamp(c.y, CAPTION_Y.min, CAPTION_Y.max), w: clamp(c.w, 0.1, 1), style: parseStyle(c.style) };
}

// Placement of the writing over a 9:16 frame, as CSS on an absolutely positioned <img>.
export const captionStyle = (c: { y: number; w: number }) => ({
  top: `${c.y * 100}%`,
  width: `${c.w * 100}%`,
  left: "50%",
  transform: "translate(-50%, -50%)",
});
