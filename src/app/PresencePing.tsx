"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 60_000;
// A person reads; a crawler that runs the page (one page each, a fresh browser each time) leaves
// in seconds. Counted only after this long on screen (his read 2026-11-17: 411 «visitors» in a
// morning, one page each, none in Analytics), and never a browser that says it is automated.
const FIRST_AFTER_MS = 15_000;
const AUTOMATED = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|python|curl|wget|phantom|puppeteer|playwright|selenium/i;

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

// Tells the server this page is open (the admin dashboard's live visitors): 15 seconds after
// arrival (at once on later pages), then once a minute — only while the page is on screen.
// Counted once this visit: later pages need not wait again.
let counted = false;

export function PresencePing() {
  const path = usePathname();
  useEffect(() => {
    if (navigator.webdriver || AUTOMATED.test(navigator.userAgent)) return;
    const key = browserKey();
    const shownAt = Date.now();
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      if (!counted && Date.now() - shownAt < FIRST_AFTER_MS - 500) return;
      counted = true;
      fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, path }), keepalive: true }).catch(() => {});
    };
    // Once counted, each next page says so straight away.
    if (counted) ping();
    const first = setTimeout(ping, FIRST_AFTER_MS);
    const timer = setInterval(ping, EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [path]);
  return null;
}
