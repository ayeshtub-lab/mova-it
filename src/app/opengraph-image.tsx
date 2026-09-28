import { ImageResponse } from "next/og";
import ar from "@/i18n/dictionaries/ar.json";
import { Line, satoriFonts } from "@/server/og-text";

// The card shown when someone shares zawmo.com itself (and any page without its own card).
// Crawlers carry no language cookie, so it is in Arabic, Zawmo's first language.
export const runtime = "nodejs";
export const alt = ar.meta.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The app icon (src/app/icon.svg), inlined so the image needs no file at run time.
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#10163a"/><path d="M22 23h50L40 55" fill="none" stroke="#ff5a66" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 45L28 77h50" fill="none" stroke="#6f9bff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="50" r="7.5" fill="#ffc940"/></svg>';
const logo = `data:image/svg+xml;base64,${Buffer.from(ICON).toString("base64")}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "linear-gradient(160deg, #10163a 0%, #2A1F4F 55%, #6b2240 100%)",
          color: "#FFFBF0",
          fontFamily: "Cairo",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser */}
        <img src={logo} alt="" width={180} height={180} />
        <Line text="زاومو" rtl fontSize={96} />
        <Line text={ar.home.tagline} rtl fontSize={52} color="#ffc940" />
        {/* End punctuation lands on the wrong side in Satori (src/server/og-text.tsx). */}
        <Line text={ar.meta.description.replace(/[.،]\s*$/, "")} rtl fontSize={34} color="#e8e2f4" />
      </div>
    ),
    { ...size, fonts: satoriFonts() },
  );
}
