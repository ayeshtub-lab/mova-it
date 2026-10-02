"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Keeps an open Zawmo up to date. An installed app (or a tab left open) keeps the code it
// first loaded for days, so fixes never reached it. When a newer version is out, the page
// reloads at a calm moment: on coming back to the app, or on the next page change — never in
// the middle of what someone is doing.
const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";
const CHECK_MS = 5 * 60 * 1000;

export function FreshVersion() {
  const stale = useRef(false);
  const pathname = usePathname();
  const first = useRef(true);

  // A page change after a newer version was seen: load it fresh.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (stale.current) window.location.reload();
  }, [pathname]);

  useEffect(() => {
    if (BUILD === "dev") return;
    const check = async () => {
      const res = await fetch("/api/version", { cache: "no-store" }).catch(() => null);
      const build = res?.ok ? ((await res.json()) as { build?: string }).build : undefined;
      if (build && build !== "dev" && build !== BUILD) stale.current = true;
    };
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      await check();
      if (stale.current) window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => document.visibilityState === "visible" && check(), CHECK_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  return null;
}
