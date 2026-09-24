// Geometry of the angle wheel (shared by the live wheel on moment pages and the
// illustration on the visitor home). Angles run clockwise from the top; the viewBox is
// centred on 0,0. Numbers are rounded to 2 decimals so server and browser agree.

export const R_IN = 34;
export const R_OUT = 122;
export const R_RING = 138;
const GAP = (1.4 * Math.PI) / 180;

const round = (n: number) => Math.round(n * 100) / 100;
export const pt = (r: number, a: number) => [round(r * Math.sin(a)), round(-r * Math.cos(a))] as const;
const f = (n: number) => n.toFixed(2);
export function slicePath(a0: number, a1: number) {
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

export function arcPath(r: number, a0: number, a1: number) {
  const s = a0 + GAP * 2;
  const e = a1 - GAP * 2;
  if (e <= s) return "";
  const [x0, y0] = pt(r, s);
  const [x1, y1] = pt(r, e);
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}`;
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

// Bounding box of a slice, so each photo fills its own slice (not the whole wheel).
export function bbox(a0: number, a1: number) {
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

