"use client";

import { useEffect, useRef, type ReactNode } from "react";

// «⭐ تحت أضواء زاومو»: a view counts once the picture was really seen — at least half of it on the
// screen for a full second (the usual measure for a seen picture) — then one small note goes to
// /api/pin-seen, once per page. The device is a random name kept in this browser (nothing personal);
// the server counts the same device once in 30 minutes, never the owner's own.
const KEY = "zw_dev";
function deviceId() {
  try {
    const known = localStorage.getItem(KEY);
    if (known && /^[a-z0-9]{16,40}$/.test(known)) return known;
    const made = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    return null; // no storage (private mode…): not counted rather than counted many times
  }
}

export function SpotSeen({ pinId, children }: { pinId: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      const device = deviceId();
      if (!device) return;
      sent = true;
      observer.disconnect();
      const body = JSON.stringify({ pin: pinId, device });
      if (!navigator.sendBeacon?.("/api/pin-seen", new Blob([body], { type: "application/json" }))) {
        fetch("/api/pin-seen", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) timer ??= setTimeout(send, 1000);
        else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [pinId]);
  return <div ref={box}>{children}</div>;
}
