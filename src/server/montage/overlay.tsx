import { join } from "node:path";
import sharp from "sharp";
import { isArabic, toArabicDigits, wrap } from "@/server/og-text";

// Montage graphics are drawn with sharp: shapes from SVG, and text through Pango/HarfBuzz,
// which shapes Arabic properly — letters joined and words evenly spaced (satori measures
// Arabic words unjoined and leaves uneven gaps).

export const FRAME = { width: 720, height: 1280 };
const W = FRAME.width;
const H = FRAME.height;
const FONT = join(process.cwd(), "public", "Cairo-Bold.ttf");

type Text = { input: Buffer; width: number; height: number };

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The middle dot "·" next to Arabic-Indic digits looks like the Arabic zero "٠", so Arabic
// lines use a vertical bar as the separator.
const arabicLine = (s: string) => toArabicDigits(s).replace(/\s·\s/g, " | ");

// Text cropped to its ink. Several lines (joined with "\n") are laid out by Pango as one
// block — line_height keeps them close, and "left" aligns to the paragraph start, which is
// the right edge for Arabic.
async function text(value: string, size: number, color: string): Promise<Text> {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}" line_height="0.75">${escape(value)}</span>`,
      align: "left",
      font: `Cairo Bold ${size}`,
      fontfile: FONT,
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

// Place a text line: `x` is its start edge (right edge for Arabic), or its centre.
const at = (t: Text, x: number, y: number, align: "start-rtl" | "start-ltr" | "center") => ({
  input: t.input,
  top: Math.round(y),
  left: Math.round(align === "center" ? (W - t.width) / 2 : align === "start-rtl" ? x - t.width : x),
});

const png = (svg: string, overlays: ReturnType<typeof at>[]) =>
  sharp(Buffer.from(svg)).composite(overlays).png().toBuffer();

export type OverlayText = {
  title: string;
  meta: string; // e.g. "٥ زوايا · ٣ أشخاص"
  label: string; // e.g. "زاوية ٢ من ٥ · كريم"
  cta: string; // e.g. "كنت هون؟ ضيف زاويتك"
  link: string; // e.g. "zawmo.com/K7M2Q4"
  stamp?: string; // the retro date/time, when the shot has it
};

// A transparent 720×1280 PNG laid over one montage segment: the Zawmo frame, which angle
// this is and whose, and at the bottom the moment's title with the invitation link —
// every exported montage is an ad that brings the next contributor back.
export async function renderOverlay(o: OverlayText) {
  const rtl = isArabic(`${o.title} ${o.cta}`);
  const line = (s: string) => (rtl ? arabicLine(s) : s);
  const side = rtl ? "start-rtl" : "start-ltr";
  const edge = rtl ? W - 44 : 44; // text start edge in the bottom block
  // The title on at most two lines, with "…" when it had to be cut.
  const titleLines = wrap(o.title, 22, 2);
  if (titleLines.join(" ").length < o.title.trim().replace(/\s+/g, " ").length) titleLines[titleLines.length - 1] += "…";
  const [brand, label, meta, cta, link, title, stamp, stampShade] = await Promise.all([
    text("zawmo", 30, "#FFFBF0"),
    text(line(o.label), 22, "#FFFBF0"),
    text(line(o.meta), 24, "#FBE2D8"),
    text(line(o.cta), 26, "#1F1A17"),
    text(o.link, 22, "#9E3320"),
    text(titleLines.map(line).join("\n"), 46, "#FFFBF0"),
    o.stamp ? text(o.stamp, 30, "#FF9A3C") : null,
    o.stamp ? text(o.stamp, 30, "#5A1E00") : null,
  ]);

  // Bottom block, stacked upwards from y = 1240: the invitation card, the meta line, the title.
  const cardH = 10 + cta.height + link.height + 10;
  const cardY = H - 40 - cardH;
  const metaY = cardY - 14 - meta.height;
  const titleY = metaY - 10 - title.height;

  // Top row: "zawmo" on the reading-start side, the angle label in a pill on the other.
  const pillW = label.width + 36;
  const pillH = label.height + 8;
  const pillX = rtl ? 44 : W - 44 - pillW;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="0.18" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.58" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="15.5" y="15.5" width="${W - 31}" height="${H - 31}" rx="30" fill="none" stroke="#FFFBF0" stroke-opacity="0.85" stroke-width="3"/>
    <rect x="${pillX}" y="40" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#000" fill-opacity="0.45"/>
    <rect x="44" y="${cardY}" width="${W - 88}" height="${cardH}" rx="22" fill="#FFFBF0" fill-opacity="0.94"/>
  </svg>`;

  return png(svg, [
    at(brand, rtl ? W - 44 : 44, 40 + (pillH - brand.height) / 2, side),
    at(label, pillX + 18 + (rtl ? label.width : 0), 44, side),
    at(title, edge, titleY, side),
    // The retro stamp, bottom left above the title, with a dark shadow to read on any picture.
    ...(stamp && stampShade ? [at(stampShade, 46, titleY - 58, "start-ltr"), at(stamp, 44, titleY - 60, "start-ltr")] : []),
    at(meta, edge, metaY, side),
    at(cta, rtl ? W - 66 : 66, cardY + 10, side),
    at(link, rtl ? W - 66 : 66, cardY + 10 + cta.height, side),
  ]);
}

export type OutroText = {
  name: string; // "زاومو"
  tagline: string; // "لحظة واحدة، من كل الزوايا"
  cta: string; // "عندك زاوية؟ ضيفها هنا"
  link: string; // "zawmo.com/K7M2Q4"
};

// The last two seconds of every montage: the Z mark (red and blue angles, the yellow
// moment), the name, and the moment's short link, big enough to read off a phone.
export async function renderOutro(o: OutroText) {
  const [name, tagline, cta, link] = await Promise.all([
    text(o.name, 96, "#FFFBF0"),
    text(o.tagline, 34, "#FBE2D8"),
    text(o.cta, 34, "#FFFBF0"),
    text(o.link, 52, "#1F1A17"),
  ]);
  const pillW = link.width + 88;
  const pillH = link.height + 28;
  const pillY = 880;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10163a"/><stop offset="0.55" stop-color="#1b2a6b"/><stop offset="1" stop-color="#10163a"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <g stroke-linecap="round" stroke-width="26" fill="none">
      <line x1="283" y1="341" x2="437" y2="341" stroke="#e63946"/>
      <line x1="405" y1="368" x2="315" y2="450" stroke="#FFFBF0"/>
      <line x1="283" y1="477" x2="437" y2="477" stroke="#2f6fed"/>
    </g>
    <circle cx="420" cy="410" r="20" fill="#ffbf1f"/>
    <rect x="${(W - pillW) / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#FFFBF0"/>
  </svg>`;
  return png(svg, [
    at(name, 0, 560, "center"),
    at(tagline, 0, 560 + name.height + 14, "center"),
    at(cta, 0, pillY - 16 - cta.height, "center"),
    at(link, 0, pillY + 14, "center"),
  ]);
}
