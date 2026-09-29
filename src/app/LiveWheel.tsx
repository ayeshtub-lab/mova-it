"use client";

// The visitor home's hero wheel, with real public shots from Zawmo: four slices, one
// swapping every few seconds for another from the pool (each fades in once its picture
// has loaded). A slice opens its moment; its owner's photo sits on the ring and their
// first name in the slice. Still for anyone who asked for reduced motion.

import { useEffect, useState } from "react";
import { arcPath, bbox, pt, R_OUT, R_RING, slicePath } from "@/lib/wheel";

export type WheelShot = { id: string; momentCode: string; title: string; name: string; avatarUrl: string | null; imageUrl: string | null };

const SLOTS = 4;
const EVERY_MS = 3200;
const FACE_R = 17;
const NAME_R = 80; // mid-slice, clear of the face on the ring

export function LiveWheel({ shots, className, openLabel }: { shots: WheelShot[]; className?: string; openLabel: string }) {
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
        {slots.map((_, i) => {
          const [fx, fy] = pt(R_RING, start(i) + step / 2);
          return (
            <g key={i}>
              <clipPath id={`live-slice-${i}`}>
                <path d={slicePath(start(i), start(i) + step)} />
              </clipPath>
              <clipPath id={`live-face-${i}`}>
                <circle cx={fx} cy={fy} r={FACE_R} />
              </clipPath>
            </g>
          );
        })}
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
          <a key={i} href={`/m/${s.momentCode}`} aria-label={`${openLabel}: ${s.title} — ${s.name}`} className="wheel-slice outline-none" style={{ animationDelay: `${i * 90}ms` }}>
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
              <text x={nx} y={ny} dy="0.35em" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" stroke="rgb(0 0 0 / 0.55)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                {[...s.name].slice(0, 12).join("")}
              </text>
              <circle cx={fx} cy={fy} r={FACE_R + 3} fill={ring} />
              {s.avatarUrl ? (
                <>
                  <circle cx={fx} cy={fy} r={FACE_R} fill="var(--surface)" />
                  <image href={s.avatarUrl} x={fx - FACE_R} y={fy - FACE_R} width={FACE_R * 2} height={FACE_R * 2} clipPath={`url(#live-face-${i})`} preserveAspectRatio="xMidYMid slice" />
                </>
              ) : (
                <text x={fx} y={fy} dy="0.35em" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">
                  {[...s.name][0] ?? "?"}
                </text>
              )}
            </g>
            <path d={slicePath(start(i), start(i) + step)} fill="none" className="wheel-outline" strokeWidth="3" />
          </a>
        );
      })}

      <circle r="30" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <circle r="17" fill="var(--moment)" className="wheel-pulse" />
      <circle r="11" fill="var(--moment)" />
    </svg>
  );
}
