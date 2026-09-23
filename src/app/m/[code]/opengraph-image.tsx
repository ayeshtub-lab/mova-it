import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { getMomentView } from "@/server/moments";

// The card WhatsApp/Telegram/iMessage show for a shared /m/[code] link. It uses the
// moment's first angle only — the one any link holder may already see ("give to get").
export const runtime = "nodejs";
export const alt = "MOVA IT";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori needs a static TrueType file (no variable fonts) or Arabic renders as boxes.
let font: ArrayBuffer | null = null;
function cairo() {
  if (!font) {
    const buf = readFileSync(join(process.cwd(), "public", "Cairo-Bold.ttf"));
    font = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  return font;
}

// Crawlers carry no language cookie, so the card follows the language of the title.
const isArabic = (text: string) => /[؀-ۿ]/.test(text);

// Satori (next/og in Next 16) shapes Arabic letters but lays the words of a line out
// left-to-right in logical order and ignores direction:rtl, so an Arabic line reads
// backwards. Workarounds, verified by rendering:
// - each Arabic line's words are reversed, so reading right-to-left gives the right order;
// - lines are wrapped by hand, so the reversal happens per visual line;
// - Latin digits glue onto neighbouring Arabic words, so they become Arabic-Indic;
// - end punctuation lands on the wrong side, so it is dropped.
const toArabicDigits = (s: string) => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

function wrap(text: string, maxChars: number, maxLines: number) {
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

function Line({ text, rtl, fontSize, color }: { text: string; rtl: boolean; fontSize: number; color?: string }) {
  return (
    <div style={{ textAlign: rtl ? "right" : "left", fontSize, lineHeight: 1.3, color }}>
      {rtl ? text.split(" ").reverse().join(" ") : text}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const view = await getMomentView((await params).code, null);
  const arabic = view ? isArabic(view.title) : true;
  const dict = arabic ? ar : en;
  const t = dict.moment;
  const first = view?.angles[0];
  const background = first ? (first.mediaType === "VIDEO" ? first.thumbUrl : first.mediaUrl) : null;
  const locale = arabic ? "ar" : "en";
  const meta = view
    ? t.meta
        .replace("{angles}", plural(locale, dict.plurals.angles, view.angleCount))
        .replace("{people}", plural(locale, dict.plurals.people, view.participantCount))
    : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#2A1F4F", fontFamily: "Cairo" }}>
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
          <img src={background} alt="" width={1200} height={630} style={{ position: "absolute", width: 1200, height: 630, objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(160deg, #2A1F4F 0%, #C8432B 60%, #F4A55B 100%)" }} />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.85) 100%)" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 56px",
            color: "#FFFBF0",
          }}
        >
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 6, direction: "ltr", alignSelf: arabic ? "flex-end" : "flex-start" }}>MOVA IT</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: arabic ? "flex-end" : "flex-start", gap: 6 }}>
            {wrap(view?.title ?? "MOVA IT", 26, 2).map((line) => (
              <Line key={line} text={arabic ? toArabicDigits(line) : line} rtl={arabic} fontSize={64} />
            ))}
            {meta && <Line text={arabic ? toArabicDigits(meta) : meta} rtl={arabic} fontSize={32} color="#FBE2D8" />}
            <div style={{ display: "flex", marginTop: 14, background: "#C8432B", borderRadius: 999, padding: "8px 30px" }}>
              <Line text={t.ctaTitle.replace(/[?؟]\s*$/, "")} rtl={arabic} fontSize={32} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Cairo", data: cairo(), weight: 700, style: "normal" }] },
  );
}
