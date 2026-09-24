"use client";

// The angle wheel: one moment in the middle (the yellow dot), every angle around it —
// a slice per contributor's shot, its owner's initial on the ring. Tapping a slice
// opens that angle in the viewer. Locked angles ("give to get") show as frosted
// slices with a lock that jump to "add your angle".

import { arcPath, bbox, pt, R_IN, R_OUT, R_RING, slicePath } from "@/lib/wheel";

type WheelAngle = { id: string; imageUrl: string | null; name: string; avatarUrl: string | null };
type Labels = { open: string; locked: string };

const MAX_SLICES = 8;

const openAngle = (id: string) => window.dispatchEvent(new CustomEvent("zawmo:open-angle", { detail: id }));

export function AngleWheel({ angles, locked, labels }: { angles: WheelAngle[]; locked: number; labels: Labels }) {
  const shown = angles.slice(0, MAX_SLICES);
  const lockedShown = Math.min(locked, MAX_SLICES - shown.length);
  const total = shown.length + lockedShown;
  if (total < 2) return null;
  const step = (Math.PI * 2) / total;

  return (
    <figure className="mx-auto w-full max-w-[22rem]">
      <svg viewBox="-160 -160 320 320" className="w-full overflow-visible" role="group" aria-label={labels.open}>
        <defs>
          {Array.from({ length: total }, (_, i) => {
            const [ax, ay] = pt(R_RING, i * step + step / 2);
            return (
              <g key={i}>
                <clipPath id={`wheel-slice-${i}`}>
                  <path d={slicePath(i * step, (i + 1) * step)} />
                </clipPath>
                <clipPath id={`wheel-face-${i}`}>
                  <circle cx={ax} cy={ay} r="14" />
                </clipPath>
              </g>
            );
          })}
        </defs>

        {/* The ring: one arc per slice, alternating the logo's red and blue. */}
        {Array.from({ length: total }, (_, i) => (
          <path
            key={`ring-${i}`}
            d={arcPath(R_RING, i * step, (i + 1) * step)}
            fill="none"
            stroke={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"}
            strokeOpacity={i < shown.length ? 0.9 : 0.3}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}

        {shown.map((a, i) => {
          const box = bbox(i * step, (i + 1) * step);
          const mid = i * step + step / 2;
          const [ax, ay] = pt(R_RING, mid);
          return (
            <g
              key={a.id}
              role="button"
              tabIndex={0}
              aria-label={`${labels.open}: ${a.name}`}
              onClick={() => openAngle(a.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openAngle(a.id);
                }
              }}
              className="wheel-slice cursor-pointer outline-none"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <g clipPath={`url(#wheel-slice-${i})`}>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--surface)" />
                {a.imageUrl && <image href={a.imageUrl} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="xMidYMid slice" />}
              </g>
              <path d={slicePath(i * step, (i + 1) * step)} fill="none" className="wheel-outline" strokeWidth="3" />
              {/* Whose angle: their account photo on the ring (initial if they have none). */}
              <circle cx={ax} cy={ay} r="17" fill={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} />
              {a.avatarUrl ? (
                <image href={a.avatarUrl} x={ax - 14} y={ay - 14} width="28" height="28" clipPath={`url(#wheel-face-${i})`} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <text x={ax} y={ay} dy="0.35em" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
                  {[...a.name][0] ?? "?"}
                </text>
              )}
            </g>
          );
        })}

        {Array.from({ length: lockedShown }, (_, j) => {
          const i = shown.length + j;
          const mid = i * step + step / 2;
          const [lx, ly] = pt((R_IN + R_OUT) / 2, mid);
          return (
            <a key={`locked-${j}`} href="#join" aria-label={labels.locked} className="wheel-slice" style={{ animationDelay: `${i * 70}ms` }}>
              <path d={slicePath(i * step, (i + 1) * step)} fill="var(--surface)" stroke="var(--line)" strokeWidth="1.5" />
              <text x={lx} y={ly} dy="0.35em" textAnchor="middle" fontSize="18">
                🔒
              </text>
            </a>
          );
        })}

        {/* The moment. */}
        <circle r="26" fill="var(--background)" stroke="var(--line)" strokeWidth="2" />
        <circle r="17" fill="var(--moment)" className="wheel-pulse" />
        <circle r="11" fill="var(--moment)" />
      </svg>
    </figure>
  );
}
