"use client";

// The visitor home's hero wheel, with real public shots from Zawmo: four slices, one
// swapping every few seconds for another from the pool (each fades in once its picture
// has loaded). A slice is a MOMENT (2026-10-17): its name in the slice, how many angles it has
// on the ring, and a tap opens it; the yellow heart opens «اكتشف». Still for anyone who asked
// for reduced motion.

import { useEffect, useState } from "react";
import { arcPath, bbox, pt, R_OUT, R_RING, slicePath } from "@/lib/wheel";

export type WheelShot = { id: string; momentCode: string; title: string; angles: number; anglesLabel?: string; name: string; avatarUrl: string | null; imageUrl: string | null };

// A moment's name in two short lines at most, on word boundaries («قهوة / الصباح»).
function lines(title: string, max = 12) {
  const words = title.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const last = out.at(-1);
    if (last !== undefined && [...`${last} ${w}`].length <= max) out[out.length - 1] = `${last} ${w}`;
    else if (out.length < 2) out.push([...w].length > max ? `${[...w].slice(0, max - 1).join("")}…` : w);
    else {
      out[1] = `${[...out[1]].slice(0, max - 1).join("")}…`;
      break;
    }
  }
  return out;
}

const SLOTS = 4;
const EVERY_MS = 3200;
const FACE_R = 17;
const NAME_R = 80; // mid-slice, clear of the count on the ring

export function LiveWheel({ shots, className, openLabel, exploreLabel }: { shots: WheelShot[]; className?: string; openLabel: string; exploreLabel: string }) {
  // Which shot each slot shows, and what it showed before its last swap (kept underneath
  // while the new one fades in).
  const [{ slots, previous }, setWheel] = useState(() => {
    const slots = shots.slice(0, SLOTS).map((_, i) => i);
    return { slots, previous: slots.map((): number | null => null) };
  });

  useEffect(() => {
    if (shots.length <= SLOTS) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let turn = 0;
    let next = SLOTS;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const slot = turn++ % SLOTS;
      const pick = next++ % shots.length;
      const swap = () =>
        setWheel((w) =>
          w.slots.includes(pick)
            ? w
            : { slots: w.slots.map((s, i) => (i === slot ? pick : s)), previous: w.previous.map((p, i) => (i === slot ? w.slots[slot] : p)) },
        );
      const url = shots[pick]?.imageUrl;
      if (!url) return swap();
      const img = new Image();
      img.onload = swap;
      img.src = url;
    }, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [shots]);

  const step = (Math.PI * 2) / SLOTS;
  const start = (i: number) => i * step - step / 2; // slot 0 centred at the top
  return (
    <svg viewBox="-162 -162 324 324" className={className} role="group" aria-label={openLabel}>
      <defs>
        {slots.map((_, i) => (
          <clipPath key={i} id={`live-slice-${i}`}>
            <path d={slicePath(start(i), start(i) + step)} />
          </clipPath>
        ))}
      </defs>

      <circle r={R_OUT + 6} fill="none" stroke="var(--surface)" strokeWidth="10" />

      {slots.map((_, i) => (
        <path
          key={`r${i}`}
          d={arcPath(R_RING, start(i), start(i) + step)}
          fill="none"
          stroke={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="16 7"
        />
      ))}

      {slots.map((index, i) => {
        const s = shots[index];
        if (!s) return null;
        const box = bbox(start(i), start(i) + step);
        const mid = start(i) + step / 2;
        const [fx, fy] = pt(R_RING, mid);
        const [nx, ny] = pt(NAME_R, mid);
        const ring = i % 2 ? "var(--brand-blue)" : "var(--brand-red)";
        const under = shots[previous[i] ?? -1]?.imageUrl;
        return (
          <a key={i} href={`/m/${s.momentCode}`} aria-label={`${openLabel}: ${s.title}${s.anglesLabel ? ` — ${s.anglesLabel}` : ""}`} className="wheel-slice outline-none" style={{ animationDelay: `${i * 90}ms` }}>
            {under && (
              <g clipPath={`url(#live-slice-${i})`}>
                <image href={under} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="xMidYMid slice" />
              </g>
            )}
            <g key={s.id} className="wheel-swap">
              <g clipPath={`url(#live-slice-${i})`}>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--surface)" />
                {s.imageUrl && <image href={s.imageUrl} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="xMidYMid slice" />}
              </g>
              {/* The moment's name, and under it how many angles it has («١٥ زاوية»). */}
              <text x={nx} y={ny} textAnchor="middle" fontWeight="800" fill="#fff" stroke="rgb(0 0 0 / 0.6)" strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round">
                {[...lines(s.title), s.anglesLabel ?? ""].filter(Boolean).map((line, k, all) => (
                  <tspan key={k} x={nx} fontSize={s.anglesLabel && k === all.length - 1 ? 11 : 14} dy={k === 0 ? `${0.35 - (all.length - 1) * 0.6}em` : "1.25em"}>
                    {line}
                  </tspan>
                ))}
              </text>
              {/* A camera on the ring (where the owner's face used to be): angles, from people there. */}
              <circle cx={fx} cy={fy} r={FACE_R + 3} fill={ring} />
              <circle cx={fx} cy={fy} r={FACE_R} fill="var(--surface)" />
              <text x={fx} y={fy} dy="0.35em" textAnchor="middle" fontSize="15" aria-hidden="true">
                📸
              </text>
            </g>
            <path d={slicePath(start(i), start(i) + step)} fill="none" className="wheel-outline" strokeWidth="3" />
          </a>
        );
      })}

      {/* The yellow heart: into the site — «اكتشف», every moment as you swipe. */}
      <a href="/discover" aria-label={exploreLabel} className="outline-none">
        <circle r="30" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
        <circle r="17" fill="var(--moment)" className="wheel-pulse" />
        <circle r="11" fill="var(--moment)" />
      </a>
    </svg>
  );
}
