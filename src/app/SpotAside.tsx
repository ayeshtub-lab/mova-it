"use client";

import { useEffect, useRef, useState } from "react";
import { SpotSeen } from "@/app/SpotSeen";

type Pin = { id: string; left: number; source: string; angleId: string; code: string; title: string; by: string; cover: string; tags: string[] };
export type SpotAsideLabels = { winner: string; pinned: string; by: string };

// «⭐ تحت أضواء زاومو» beyond the home page (his call 2026-11-12: «ناس بتيجي من لحظات مش على
// الرئيسية»): one card on a shot, moment or topic page, for people only. It is fetched only once the
// reader scrolls near it (search engines read the page without scrolling, and /api/ is closed to
// them in robots.txt), its link is nofollow — so the page stays about its own subject for Google,
// and the shot itself is indexed where it belongs (its own page, its moment, its topics).
// The closest first (his rule 9/11): a shot sharing a #hashtag with this page, else any; never
// this page's own shot or moment. Counted as on the home page (src/app/SpotSeen.tsx).
export function SpotAside({ tags = [], notAngle, notCode, labels }: { tags?: string[]; notAngle?: string; notCode?: string; labels: SpotAsideLabels }) {
  const box = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<Pin | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let live = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        fetch("/api/spotlight")
          .then((r) => (r.ok ? (r.json() as Promise<{ pins: Pin[] }>) : { pins: [] }))
          .then(({ pins }) => {
            if (!live) return;
            const open = pins.filter((p) => p.left > 0 && p.angleId !== notAngle && p.code !== notCode);
            const wanted = new Set(tags.map((t) => t.normalize("NFC").toLowerCase()));
            const close = open.filter((p) => p.tags.some((t) => wanted.has(t)));
            setPin(pick(close.length ? close : open));
          })
          .catch(() => {});
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page
  }, []);

  return (
    <div ref={box}>
      {pin && (
        <SpotSeen pinId={pin.id}>
          <a href={`/m/${pin.code}#angle-${pin.angleId}`} rel="nofollow" className="group flex items-center gap-3 overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-amber-50/60 p-2 dark:bg-amber-400/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- the shot's fixed public address */}
            <img src={pin.cover} alt="" loading="lazy" className="size-24 shrink-0 rounded-2xl object-cover transition-transform group-hover:scale-105" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{pin.source === "winner" ? labels.winner : labels.pinned}</span>
              <span className="truncate font-extrabold">{pin.title}</span>
              <span className="text-sm text-muted">{labels.by.replace("{name}", pin.by)}</span>
            </span>
          </a>
        </SpotSeen>
      )}
    </div>
  );
}

// The more it has left to show, the likelier (as src/server/points.ts pickPin).
function pick(pins: Pin[]) {
  const total = pins.reduce((a, p) => a + p.left, 0);
  if (!total) return null;
  let at = Math.random() * total;
  for (const p of pins) if ((at -= p.left) < 0) return p;
  return pins[pins.length - 1];
}
