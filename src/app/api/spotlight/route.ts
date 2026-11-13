import { NextResponse } from "next/server";
import { runningPins } from "@/server/spot-pins";

// «⭐ تحت أضواء زاومو» on the moment, shot and topic pages (src/app/SpotAside.tsx): the shots
// running now, the same for everyone — so it is kept by the CDN for a minute and the database is
// read at most once a minute however many people scroll. Each visitor's browser picks one.
export async function GET() {
  const now = Date.now();
  const pins = (await runningPins().catch(() => [])).filter((p) => new Date(p.endsAt).getTime() > now && p.shown < p.budget);
  return NextResponse.json(
    { pins: pins.map(({ id, budget, shown, source, angleId, film, href, code, title, by, cover, tags }) => ({ id, left: Math.max(0, budget - shown), source, angleId, film, href, code, title, by, cover, tags })) },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=60", "x-robots-tag": "noindex" } },
  );
}
