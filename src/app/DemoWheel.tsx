import { arcPath, pt, R_IN, R_OUT, R_RING, slicePath } from "@/lib/wheel";

// The visitor home's hero art: an angle wheel for an imaginary moment — four friends,
// four angles of the same sunset — so the idea reads before any text does.
const SLICES = [
  { from: "#ff7e5f", to: "#feb47b", emoji: "🌅", initial: "س" },
  { from: "#2193b0", to: "#6dd5ed", emoji: "🌊", initial: "ك" },
  { from: "#11998e", to: "#38ef7d", emoji: "🌴", initial: "ل" },
  { from: "#ee0979", to: "#ff6a00", emoji: "🎉", initial: "م" },
];

export function DemoWheel({ className }: { className?: string }) {
  const step = (Math.PI * 2) / SLICES.length;
  return (
    <svg viewBox="-160 -160 320 320" className={className} aria-hidden="true">
      <defs>
        {SLICES.map((s, i) => (
          <linearGradient key={i} id={`demo-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={s.from} />
            <stop offset="1" stopColor={s.to} />
          </linearGradient>
        ))}
      </defs>
      {SLICES.map((_, i) => (
        <path key={`r${i}`} d={arcPath(R_RING, i * step, (i + 1) * step)} fill="none" stroke={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} strokeWidth="5" strokeLinecap="round" />
      ))}
      {SLICES.map((s, i) => {
        const mid = i * step + step / 2;
        const [ex, ey] = pt((R_IN + R_OUT) / 2 + 8, mid);
        const [ax, ay] = pt(R_RING, mid);
        return (
          <g key={i} className="wheel-slice" style={{ animationDelay: `${i * 90}ms` }}>
            <path d={slicePath(i * step, (i + 1) * step)} fill={`url(#demo-${i})`} />
            <text x={ex} y={ey} dy="0.35em" textAnchor="middle" fontSize="30">
              {s.emoji}
            </text>
            <circle cx={ax} cy={ay} r="13" fill={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} stroke="var(--background)" strokeWidth="3" />
            <text x={ax} y={ay} dy="0.35em" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
              {s.initial}
            </text>
          </g>
        );
      })}
      <circle r="26" fill="var(--background)" stroke="var(--line)" strokeWidth="2" />
      <circle r="17" fill="var(--moment)" className="wheel-pulse" />
      <circle r="11" fill="var(--moment)" />
    </svg>
  );
}
