import { arcPath, bbox, pt, R_OUT, R_RING, slicePath } from "@/lib/wheel";

// The visitor home's hero art: an angle wheel for an imaginary day — four friends,
// each with their own account photo and name, each adding their angle. Photos are
// Unsplash (free licence), stored in /public/demo; illustrative, not real users.
const SLICES = [
  { photo: "/demo/coffee.webp", face: "/demo/face-sara.webp", name: { ar: "سارة", en: "Sara" } },
  { photo: "/demo/sea.webp", face: "/demo/face-karim.webp", name: { ar: "كريم", en: "Karim" } },
  { photo: "/demo/nature.webp", face: "/demo/face-mazen.webp", name: { ar: "مازن", en: "Mazen" } },
  { photo: "/demo/graduation.webp", face: "/demo/face-layan.webp", name: { ar: "ليان", en: "Layan" } },
];
const FACE_R = 18;

export function DemoWheel({ className, locale }: { className?: string; locale: string }) {
  const step = (Math.PI * 2) / SLICES.length;
  return (
    <svg viewBox="-172 -172 344 344" className={className} aria-hidden="true">
      <defs>
        {SLICES.map((_, i) => {
          const [fx, fy] = pt(R_RING, i * step + step / 2);
          return (
            <g key={i}>
              <clipPath id={`demo-slice-${i}`}>
                <path d={slicePath(i * step, (i + 1) * step)} />
              </clipPath>
              <clipPath id={`demo-face-${i}`}>
                <circle cx={fx} cy={fy} r={FACE_R} />
              </clipPath>
            </g>
          );
        })}
      </defs>

      {SLICES.map((_, i) => (
        <path key={`r${i}`} d={arcPath(R_RING, i * step, (i + 1) * step)} fill="none" stroke={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} strokeWidth="5" strokeLinecap="round" />
      ))}

      {SLICES.map((s, i) => {
        const box = bbox(i * step, (i + 1) * step);
        const mid = i * step + step / 2;
        const [fx, fy] = pt(R_RING, mid);
        const [nx, ny] = pt(R_OUT - 34, mid);
        const name = locale === "ar" ? s.name.ar : s.name.en;
        const w = name.length * 8 + 16;
        return (
          <g key={i} className="wheel-slice" style={{ animationDelay: `${i * 90}ms` }}>
            <g clipPath={`url(#demo-slice-${i})`}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--surface)" />
              <image href={s.photo} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="xMidYMid slice" />
            </g>
            {/* The friend's account: photo on the ring, name on their angle. */}
            <circle cx={fx} cy={fy} r={FACE_R + 3} fill={i % 2 ? "var(--brand-blue)" : "var(--brand-red)"} />
            <circle cx={fx} cy={fy} r={FACE_R} fill="var(--surface)" />
            <image href={s.face} x={fx - FACE_R} y={fy - FACE_R} width={FACE_R * 2} height={FACE_R * 2} clipPath={`url(#demo-face-${i})`} preserveAspectRatio="xMidYMid slice" />
            <rect x={nx - w / 2} y={ny - 10} width={w} height="20" rx="10" fill="rgb(0 0 0 / 0.55)" />
            <text x={nx} y={ny} dy="0.35em" textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#fff">
              {name}
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
