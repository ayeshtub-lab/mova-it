import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { needsName, startQuietGuest } from "@/server/quiet-guest";
import { ReactionError, setReaction } from "@/server/reactions";
import { allowedFor, limited } from "@/server/rate-limit";

// Body: { liked: true } to like, { liked: false } to take it back. A visitor's first heart makes them
// a quiet guest; an unnamed guest's sixth is answered «name_needed» (src/server/quiet-guest.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("liked" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let user = await getCurrentUser();
  if (!user) {
    if (body.liked !== true) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    // Many new guest accounts from one network is a script, not people.
    if (!(await allowedFor("guest", request.headers))) return NextResponse.json({ error: "name_needed" }, { status: 403 });
    user = await startQuietGuest();
  } else if (body.liked === true && (await needsName(user))) return NextResponse.json({ error: "name_needed" }, { status: 403 });
  const slow = await limited("react", request, user.id);
  if (slow) return slow;

  const { id } = await params;
  try {
    return NextResponse.json(await setReaction(user, id, body.liked));
  } catch (error) {
    if (error instanceof ReactionError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    }
    throw error;
  }
}
