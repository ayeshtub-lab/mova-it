"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 60_000;

// A random id kept by this browser (a fresh one each visit if storage is blocked).
function browserKey() {
  try {
    let key = localStorage.getItem("zawmo:visitor");
    if (!key) {
      key = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem("zawmo:visitor", key);
    }
    return key;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

// Tells the server this page is open (the admin dashboard's live visitors): on arrival,
// on each page change, then once a minute — only while the page is on screen.
export function PresencePing() {
  const path = usePathname();
  useEffect(() => {
    const key = browserKey();
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, path }), keepalive: true }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [path]);
  return null;
}
