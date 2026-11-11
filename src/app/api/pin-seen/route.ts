import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOT_NEWCOMERS, SOURCE_COOKIE } from "@/lib/source";
import { getCurrentUser } from "@/lib/session";
import { networkOf } from "@/server/rate-limit";
import { countSeen } from "@/server/points";

// «⭐ تحت أضواء زاومو»: a pinned picture was really on someone's screen (src/app/SpotSeen.tsx).
// Counted by src/server/points.ts countSeen — once per device in 30 minutes, never the owner, never
// past what was bought. Not counted at all: search engines and other robots, and the team's own
// devices («📱 هاد جهازي», «🧪 جهاز تجربة»). Always answers 204: nothing to wait for.
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pagespeed|curl|wget|python|axios|node-fetch/i;

export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  try {
    if (ROBOT.test(request.headers.get("user-agent") ?? "")) return done;
    const body = (await request.json().catch(() => null)) as { pin?: unknown; device?: unknown } | null;
    const pin = typeof body?.pin === "string" && /^[a-z0-9]{20,40}$/.test(body.pin) ? body.pin : null;
    const device = typeof body?.device === "string" && /^[a-z0-9]{16,40}$/.test(body.device) ? body.device : null;
    if (!pin || !device) return done;
    const source = (await cookies()).get(SOURCE_COOKIE)?.value;
    if (source && (NOT_NEWCOMERS as readonly string[]).includes(source)) return done;
    const user = await getCurrentUser().catch(() => null);
    if (user?.isAdmin) return done;
    await countSeen(pin, device, networkOf(request.headers, "pin"), user?.id ?? null);
  } catch (error) {
    console.error("pin seen failed", error);
  }
  return done;
}
