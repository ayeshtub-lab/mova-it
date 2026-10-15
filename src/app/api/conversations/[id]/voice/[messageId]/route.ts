import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ChatError, voicePath } from "@/server/conversations";
import { viewUrl } from "@/server/media";

// A voice message's file — for the conversation's two people only: forwarded to a short-lived link.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, messageId } = await params;
  try {
    const url = await viewUrl(await voicePath(user, id, messageId));
    if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
