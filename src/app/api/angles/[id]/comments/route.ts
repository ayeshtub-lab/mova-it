import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addComment, CommentError, listComments } from "@/server/comments";
import { unnamedGuest } from "@/lib/guest-name";
import { limited } from "@/server/rate-limit";

const failure = (error: unknown) => {
  if (!(error instanceof CommentError)) throw error;
  const status = error.code === "not_found" ? 404 : error.code === "too_many" ? 429 : 400;
  return NextResponse.json({ error: error.code }, { status });
};

// Visitors may read the comments of public moments; writing needs an account.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    return NextResponse.json({ comments: await listComments(user, (await params).id) });
  } catch (error) {
    return failure(error);
  }
}

// Body: { body: "text", parentId?: "comment id" } — parentId makes it a reply.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Words in public need a name (2026-10-31): a guest still called «ضيف ٤٢١٧» is asked for theirs.
  if (unnamedGuest(user)) return NextResponse.json({ error: "name_needed" }, { status: 403 });
  const slow = await limited("comment", request, user.id);
  if (slow) return slow;
  const payload = await request.json().catch(() => null);
  try {
    return NextResponse.json(await addComment(user, (await params).id, payload?.body, payload?.parentId ?? null), { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
