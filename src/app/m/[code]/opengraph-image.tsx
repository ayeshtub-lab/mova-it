import { ImageResponse } from "next/og";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { getMomentView } from "@/server/moments";
import { isArabic, Line, satoriFonts, wrap } from "@/server/og-text";

// The card WhatsApp/Telegram/iMessage show for a shared /m/[code] link. It uses the
// moment's first angle only — the one any link holder may already see ("give to get").
export const runtime = "nodejs";
export const alt = "Zawmo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fullBox = { position: "absolute", top: 0, left: 0, width: 1200, height: 630 } as const;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const view = await getMomentView((await params).code, null);
  // Crawlers carry no language cookie, so the card follows the language of the title.
  const arabic = view ? isArabic(view.title) : true;
  const dict = arabic ? ar : en;
  const locale = arabic ? "ar" : "en";
  const first = view?.angles[0];
  const background = first ? (first.mediaType === "VIDEO" ? first.thumbUrl : first.mediaUrl) : null;
  const meta = view
    ? dict.moment.meta
        .replace("{angles}", plural(locale, dict.plurals.angles, view.angleCount))
        .replace("{people}", plural(locale, dict.plurals.people, view.participantCount))
    : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#2A1F4F", fontFamily: "Cairo" }}>
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
          <img src={background} alt="" width={1200} height={630} style={{ ...fullBox, objectFit: "cover" }} />
        ) : (
          <div style={{ ...fullBox, display: "flex", background: "linear-gradient(160deg, #2A1F4F 0%, #C8432B 60%, #F4A55B 100%)" }} />
        )}
        <div style={{ ...fullBox, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.85) 100%)" }} />
        <div style={{ ...fullBox, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px 56px", color: "#FFFBF0" }}>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 2, alignSelf: arabic ? "flex-end" : "flex-start" }}>zawmo</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: arabic ? "flex-end" : "flex-start", gap: 6 }}>
            {wrap(view?.title ?? "Zawmo", 26, 2).map((line) => (
              <Line key={line} text={line} rtl={arabic} fontSize={64} />
            ))}
            {meta && <Line text={meta} rtl={arabic} fontSize={32} color="#FBE2D8" />}
            <div style={{ display: "flex", marginTop: 14, background: "#C8432B", borderRadius: 999, padding: "8px 30px" }}>
              <Line text={dict.moment.ctaTitle} rtl={arabic} fontSize={32} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: satoriFonts() },
  );
}
