import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ChatError, openConversation, sendChatMessage } from "@/server/conversations";
import { limited } from "@/server/rate-limit";

const status = (e: ChatError) => (e.code === "not_found" ? 404 : e.code === "blocked" ? 403 : e.code === "too_many" ? 429 : 400);

// One conversation: the other person, and its latest messages (src/server/conversations.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await openConversation(user, (await params).id));
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: status(error) });
    throw error;
  }
}

// A new message — { body } — and the other person told on their phone (after the response).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("message", request, user.id);
  if (slow) return slow;
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  try {
    const { message, tell } = await sendChatMessage(user, (await params).id, body?.body, new URL(request.url).origin);
    after(() => tell().catch((error) => console.error("chat push failed", error)));
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: status(error) });
    throw error;
  }
}
