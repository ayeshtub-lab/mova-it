"use client";

// The angle wheel: one moment in the middle (the yellow dot), every angle around it —
// a slice per contributor's shot, its owner's initial on the ring. Tapping a slice
// opens that angle in the viewer. Locked angles ("give to get") show as frosted
// slices with a lock that jump to "add your angle".

type WheelAngle = { id: string; imageUrl: string | null; name: string };
type Labels = { open: string; locked: string };

const MAX_SLICES = 8;
const R_IN = 34;
const R_OUT = 122;
const R_RING = 138;
const GAP = (1.4 * Math.PI) / 180;

// Rounded to 2 decimals so server and browser render identical numbers (no hydration diff).
const round = (n: number) => Math.round(n * 100) / 100;
const pt = (r: number, a: number) => [round(r * Math.sin(a)), round(-r * Math.cos(a))] as const;
const f = (n: number) => n.toFixed(2);

function slicePath(a0: number, a1: number) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    // A single angle: the whole ring (two half arcs each way).
    return `M0 ${-R_OUT}A${R_OUT} ${R_OUT} 0 1 1 0 ${R_OUT}A${R_OUT} ${R_OUT} 0 1 1 0 ${-R_OUT}ZM0 ${-R_IN}A${R_IN} ${R_IN} 0 1 0 0 ${R_IN}A${R_IN} ${R_IN} 0 1 0 0 ${-R_IN}Z`;
  }
  const s = a0 + GAP / 2;
  const e = a1 - GAP / 2;
  const large = e - s > Math.PI ? 1 : 0;
  const [x0, y0] = pt(R_IN, s);
  const [x1, y1] = pt(R_OUT, s);
  const [x2, y2] = pt(R_OUT, e);
  const [x3, y3] = pt(R_IN, e);
  return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}A${R_OUT} ${R_OUT} 0 ${large} 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${R_IN} ${R_IN} 0 ${large} 0 ${f(x0)} ${f(y0)}Z`;
}

function arcPath(r: number, a0: number, a1: number) {
  const s = a0 + GAP * 2;
  const e = a1 - GAP * 2;
  if (e <= s) return "";
  const [x0, y0] = pt(r, s);
  const [x1, y1] = pt(r, e);
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}`;
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

// Bounding box of a slice, so each photo fills its own slice (not the whole wheel).
function bbox(a0: number, a1: number) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return { x: -R_OUT, y: -R_OUT, w: R_OUT * 2, h: R_OUT * 2 };
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = a0 + ((a1 - a0) * i) / 12;
    for (const r of [R_IN, R_OUT]) {
      const [x, y] = pt(r, a);
      xs.push(x);
      ys.push(y);
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: round(Math.max(...xs) - x), h: round(Math.max(...ys) - y) };
}

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
          {Array.from({ length: total }, (_, i) => (
            <clipPath key={i} id={`wheel-slice-${i}`}>
              <path d={slicePath(i * step, (i + 1) * step)} />
            </clipPath>
          ))}
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
              <circle cx={ax} cy={ay} r="12" fill={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} stroke="var(--background)" strokeWidth="3" />
              <text x={ax} y={ay} dy="0.35em" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
                {[...a.name][0] ?? "?"}
              </text>
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
