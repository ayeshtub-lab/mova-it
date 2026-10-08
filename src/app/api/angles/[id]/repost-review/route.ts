import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { askRepostReview, ModerationError } from "@/server/moderation";

// «من تصويري، راجعوها»: the owner of a shot kept from everyone (screening «repost») asks for a review.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await askRepostReview(user, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ModerationError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
