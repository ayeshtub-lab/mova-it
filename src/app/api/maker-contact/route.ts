import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limited } from "@/server/rate-limit";
import { countContact, revealWhatsapp } from "@/server/makers";

// «🏪»: someone tapped to reach a maker (src/app/m/[code]/MakerCard.tsx). For WhatsApp it answers the
// number — the only place it ever leaves the database — and every tap is counted (the pilot's «did
// anyone reach out?»). Not counted: the maker themselves, the team. Robots never get here (/api/ is
// closed to them, and the number needs a POST).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { maker?: unknown; via?: unknown } | null;
  const maker = typeof body?.maker === "string" && /^[a-z0-9]{20,40}$/.test(body.maker) ? body.maker : null;
  const via = body?.via === "whatsapp" || body?.via === "page" || body?.via === "message" ? body.via : null;
  if (!maker || !via) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const user = await getCurrentUser().catch(() => null);
  const slow = await limited("makerContact", request, user?.id);
  if (slow) return slow;
  const counted = user?.id !== maker && !user?.isAdmin;
  if (via === "whatsapp") {
    const number = await revealWhatsapp(maker, counted);
    return number ? NextResponse.json({ number }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (counted) await countContact(maker);
  return new NextResponse(null, { status: 204 });
}
