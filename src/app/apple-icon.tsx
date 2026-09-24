import { ImageResponse } from "next/og";

// Home-screen icon (iPhone "Add to Home Screen"): the Z mark on the dark ground.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#10163a" }}>
        <svg width="132" height="132" viewBox="0 0 100 100">
          <path d="M16 18h56L36 54" fill="none" stroke="#ff5a66" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M64 46L28 82h56" fill="none" stroke="#6f9bff" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="50" r="8" fill="#ffc940" />
        </svg>
      </div>
    ),
    size,
  );
}
