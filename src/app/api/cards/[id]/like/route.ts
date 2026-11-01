import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { CardError, likeCard } from "@/server/cards";
import { startQuietGuest } from "@/server/quiet-guest";
import { allowedFor, limited } from "@/server/rate-limit";

// ❤️ on a public card. Body: { liked: true | false }. A visitor's first heart makes them a quiet
// guest, as a heart on a shot does (src/app/api/angles/[id]/reaction).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.liked !== "boolean") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  let user = await getCurrentUser();
  if (!user) {
    if (!body.liked) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!(await allowedFor("guest", request.headers))) return NextResponse.json({ error: "name_needed" }, { status: 403 });
    user = await startQuietGuest();
  }
  const slow = await limited("react", request, user.id);
  if (slow) return slow;
  try {
    return NextResponse.json(await likeCard(user, (await params).id, body.liked));
  } catch (error) {
    if (error instanceof CardError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    throw error;
  }
}
