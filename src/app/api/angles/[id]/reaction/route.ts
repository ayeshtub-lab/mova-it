import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ReactionError, setReaction } from "@/server/reactions";
import { limited } from "@/server/rate-limit";

// Body: { liked: true } to like, { liked: false } to take it back.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("react", request, user.id);
  if (slow) return slow;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("liked" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

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
