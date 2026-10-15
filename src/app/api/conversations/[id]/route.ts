import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { acceptRequest, ChatError, openConversation, setMuted, setTyping } from "@/server/conversations";
import { blockUser } from "@/server/moderation";

// The conversation itself: { action: "typing" | "mute" | "unmute" | "accept" | "block" }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  try {
    if (body?.action === "typing") await setTyping(user, id);
    else if (body?.action === "mute" || body?.action === "unmute") await setMuted(user, id, body.action === "mute");
    else if (body?.action === "accept") await acceptRequest(user, id);
    else if (body?.action === "block") await blockUser(user, (await openConversation(user, id)).other.id);
    else return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    throw error;
  }
}
