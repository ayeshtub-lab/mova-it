import { arcPath, bbox, pt, R_OUT, R_RING, slicePath } from "@/lib/wheel";

// The visitor home's hero art, after the owner's mockup: a big angle wheel with four
// friends' angles of one day — slices centred up, right, down and left — each friend's
// account photo on the dashed red/blue ring, the moment (yellow) in the middle.
// Scene photos come from the owner's own mockup; faces are Unsplash (see CREDITS.txt).
const SLICES = [
  { photo: "/demo/moment-camera.webp", face: "/demo/face-sara.webp" },
  { photo: "/demo/moment-mountain.webp", face: "/demo/face-karim.webp" },
  { photo: "/demo/moment-graffiti.webp", face: "/demo/face-mazen.webp" },
  { photo: "/demo/moment-leaf.webp", face: "/demo/face-layan.webp" },
];
const FACE_R = 17;

export function DemoWheel({ className }: { className?: string }) {
  const step = (Math.PI * 2) / SLICES.length;
  const start = (i: number) => i * step - step / 2; // slice 0 centred at the top
  return (
    <svg viewBox="-162 -162 324 324" className={className} aria-hidden="true">
      <defs>
        {SLICES.map((_, i) => {
          const [fx, fy] = pt(R_RING, start(i) + step / 2);
          return (
            <g key={i}>
              <clipPath id={`demo-slice-${i}`}>
                <path d={slicePath(start(i), start(i) + step)} />
              </clipPath>
              <clipPath id={`demo-face-${i}`}>
                <circle cx={fx} cy={fy} r={FACE_R} />
              </clipPath>
            </g>
          );
        })}
      </defs>

      {/* Bezel between the photos and the ring. */}
      <circle r={R_OUT + 6} fill="none" stroke="var(--surface)" strokeWidth="10" />

      {SLICES.map((_, i) => (
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

      {SLICES.map((s, i) => {
        const box = bbox(start(i), start(i) + step);
        const [fx, fy] = pt(R_RING, start(i) + step / 2);
        return (
          <g key={i} className="wheel-slice" style={{ animationDelay: `${i * 90}ms` }}>
            <g clipPath={`url(#demo-slice-${i})`}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--surface)" />
              <image href={s.photo} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="xMidYMid slice" />
            </g>
            <circle cx={fx} cy={fy} r={FACE_R + 3} fill={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} />
            <circle cx={fx} cy={fy} r={FACE_R} fill="var(--surface)" />
            <image href={s.face} x={fx - FACE_R} y={fy - FACE_R} width={FACE_R * 2} height={FACE_R * 2} clipPath={`url(#demo-face-${i})`} preserveAspectRatio="xMidYMid slice" />
          </g>
        );
      })}

      <circle r="30" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <circle r="17" fill="var(--moment)" className="wheel-pulse" />
      <circle r="11" fill="var(--moment)" />
    </svg>
  );
}
