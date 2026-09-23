import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { CommentError, deleteComment } from "@/server/comments";

// Delete a comment: its author, or the creator of the moment it is in.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await deleteComment(user, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CommentError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
