import type { MetadataRoute } from "next";

// Lets Zawmo be added to the home screen as an app (on iPhone, notifications need it) — and is the
// Android app's too (a Trusted Web Activity of zawmo.com: android/twa-manifest.json). Its
// shortcuts show on a long press of the icon; «شارك» → زاومو from the gallery brings photos and
// videos into a new moment (share_target, handled by public/sw.js).
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
    categories: ["social", "photo", "lifestyle"],
    // A link to Zawmo opens in the app window already open, not a second one.
    launch_handler: { client_mode: "navigate-existing" },
    shortcuts: [
      { name: "صوّر لحظة", short_name: "صوّر", url: "/new?src=app-shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "اكتشف", short_name: "اكتشف", url: "/discover?src=app-shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "الوارد", short_name: "الوارد", url: "/inbox?src=app-shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", files: [{ name: "media", accept: ["image/*", "video/*"] }] },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
