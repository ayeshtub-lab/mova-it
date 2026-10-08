"use client";

import { useEffect } from "react";

// Zawmo as an app — added to the home screen, or the Android app (a Trusted Web Activity, which
// opens with an «android-app://» referrer and shows full screen): the page is marked
// (html[data-app]) so the website-only parts go (globals.css), for the whole visit. And the
// service worker is kept in place for every visitor — the offline screen and «شارك لزاومو» from
// the gallery need it, not only notifications (public/sw.js).
export function AppShell() {
  useEffect(() => {
    let app = false;
    try {
      app = matchMedia("(display-mode: standalone)").matches || document.referrer.startsWith("android-app://") || sessionStorage.getItem("zawmo-app") === "1";
      if (app) sessionStorage.setItem("zawmo-app", "1");
    } catch {}
    if (app) document.documentElement.dataset.app = "1";
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
