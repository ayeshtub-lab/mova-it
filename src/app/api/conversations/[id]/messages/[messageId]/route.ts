import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ChatError, deleteMessage, reactTo, reportMessage } from "@/server/conversations";
import { limited } from "@/server/rate-limit";

const status = (e: ChatError) => (e.code === "not_found" ? 404 : e.code === "blocked" ? 403 : e.code === "too_late" ? 409 : 400);

// Around one message: { action: "react", emoji } · { action: "delete", forAll } · { action: "report", reason }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("react", request, user.id);
  if (slow) return slow;
  const { id, messageId } = await params;
  const body = (await request.json().catch(() => null)) as { action?: unknown; emoji?: unknown; forAll?: unknown; reason?: unknown } | null;
  try {
    if (body?.action === "react") await reactTo(user, id, messageId, body.emoji);
    else if (body?.action === "delete") await deleteMessage(user, id, messageId, body.forAll === true);
    else if (body?.action === "report") await reportMessage(user, id, messageId, body.reason);
    else return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: status(error) });
    throw error;
  }
}
