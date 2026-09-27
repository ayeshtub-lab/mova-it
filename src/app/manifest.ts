import type { MetadataRoute } from "next";

// Lets Zawmo be added to the home screen as an app (on iPhone, notifications need it).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "زاومو — Zawmo",
    short_name: "زاومو",
    description: "لحظة واحدة، من كل الزوايا",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#10163a",
    theme_color: "#10163a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
