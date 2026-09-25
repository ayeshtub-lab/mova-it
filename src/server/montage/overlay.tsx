import { ImageResponse } from "next/og";
import { isArabic, Line, satoriFonts, wrap } from "@/server/og-text";

export const FRAME = { width: 720, height: 1280 };

export type OverlayText = {
  title: string;
  meta: string; // e.g. "٥ زوايا · ٣ أشخاص"
  label: string; // e.g. "زاوية ٢ من ٥ · كريم"
  cta: string; // e.g. "كنت هون؟ ضيف زاويتك"
  link: string; // e.g. "zawmo.com/K7M2Q4"
};

const box = { position: "absolute", top: 0, left: 0, width: FRAME.width, height: FRAME.height } as const;

// A transparent 720×1280 PNG laid over one montage segment: the Zawmo frame, which angle
// this is and whose, and at the bottom the moment's title with the invitation link —
// every exported montage is an ad that brings the next contributor back.
export async function renderOverlay(text: OverlayText) {
  const rtl = isArabic(`${text.title} ${text.cta}`);
  const align = rtl ? "flex-end" : "flex-start";

  const image = new ImageResponse(
    (
      <div style={{ ...box, display: "flex", fontFamily: "Cairo", color: "#FFFBF0" }}>
        <div style={{ ...box, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.82) 100%)" }} />
        <div style={{ position: "absolute", top: 14, left: 14, width: FRAME.width - 28, height: FRAME.height - 28, display: "flex", border: "3px solid rgba(255,251,240,0.85)", borderRadius: 30 }} />
        <div style={{ position: "absolute", top: 40, left: 44, width: FRAME.width - 88, display: "flex", justifyContent: "space-between", alignItems: "center", flexDirection: rtl ? "row-reverse" : "row" }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 2 }}>zawmo</div>
          <div style={{ display: "flex", background: "rgba(0,0,0,0.45)", borderRadius: 999, padding: "4px 18px" }}>
            <Line text={text.label} rtl={rtl} fontSize={22} />
          </div>
        </div>
        <div style={{ position: "absolute", left: 44, top: 860, width: FRAME.width - 88, height: 380, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: align, gap: 4 }}>
          {wrap(text.title, 22, 2).map((line) => (
            <Line key={line} text={line} rtl={rtl} fontSize={46} />
          ))}
          <Line text={text.meta} rtl={rtl} fontSize={24} color="#FBE2D8" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: align, marginTop: 14, background: "rgba(255,251,240,0.94)", color: "#1F1A17", borderRadius: 22, padding: "10px 22px", width: FRAME.width - 88 }}>
            <Line text={text.cta} rtl={rtl} fontSize={26} />
            <div style={{ display: "flex", fontSize: 22, color: "#9E3320" }}>{text.link}</div>
          </div>
        </div>
      </div>
    ),
    { ...FRAME, fonts: satoriFonts() },
  );
  return Buffer.from(await image.arrayBuffer());
}
