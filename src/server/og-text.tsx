import { readFileSync } from "node:fs";
import { join } from "node:path";

// Shared helpers for images drawn with Satori (next/og): the share card and the
// montage frames.
//
// Satori (Next 16) shapes Arabic letters but lays the words of a line out
// left-to-right in logical order and ignores direction:rtl, so an Arabic line reads
// backwards. Workarounds, verified by rendering:
// - each Arabic line's words are reversed, so reading right-to-left gives the right order;
// - lines are wrapped by hand, so the reversal happens per visual line;
// - Latin digits glue onto neighbouring Arabic words, so they become Arabic-Indic;
// - end punctuation lands on the wrong side, so it is dropped;
// - `inset` is unsupported: absolute boxes need top/left/width/height.

let font: ArrayBuffer | null = null;
// Satori needs a static TrueType file (no variable fonts) or Arabic renders as boxes.
export function cairoBold() {
  if (!font) {
    const buf = readFileSync(join(process.cwd(), "public", "Cairo-Bold.ttf"));
    font = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  return font;
}

export const satoriFonts = () => [{ name: "Cairo", data: cairoBold(), weight: 700 as const, style: "normal" as const }];

export const isArabic = (text: string) => /[؀-ۿ]/.test(text);

export const toArabicDigits = (s: string) => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

export function wrap(text: string, maxChars: number, maxLines: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/)) {
    if (current && current.length + 1 + word.length > maxChars) {
      lines.push(current);
      if (lines.length === maxLines) return lines;
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

// The middle dot "·" drawn next to Arabic-Indic digits looks like the Arabic zero "٠"
// ("من ٣ ·" reads as "من ٠٣"), so Arabic lines use a vertical bar as the separator.
export function Line({ text, rtl, fontSize, color }: { text: string; rtl: boolean; fontSize: number; color?: string }) {
  const shown = rtl ? toArabicDigits(text).replace(/[?؟]\s*$/, "").replace(/\s·\s/g, " | ") : text;
  return (
    <div style={{ textAlign: rtl ? "right" : "left", fontSize, lineHeight: 1.3, color }}>
      {rtl ? shown.split(" ").reverse().join(" ") : shown}
    </div>
  );
}
