import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { CommentError, setCommentLike } from "@/server/comments";

// Body: { liked: true | false }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await setCommentLike(user, (await params).id, body?.liked));
  } catch (error) {
    if (!(error instanceof CommentError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
  }
}
