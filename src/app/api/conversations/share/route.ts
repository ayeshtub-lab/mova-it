import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ChatError, sendCard } from "@/server/conversations";
import { limited } from "@/server/rate-limit";

// «📸 ابعت لصاحب» / «ضيف زاويتك»: { userId, code, angleId?, invite? } — a card in your conversation
// with them (started if there was none). Answers { id } of the conversation.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("message", request, user.id);
  if (slow) return slow;
  const body = (await request.json().catch(() => null)) as { userId?: unknown; code?: unknown; angleId?: unknown; invite?: unknown } | null;
  try {
    const { id, tell } = await sendCard(user, body?.userId, { code: body?.code, angleId: body?.angleId, invite: body?.invite }, new URL(request.url).origin);
    after(() => tell().catch((error) => console.error("chat push failed", error)));
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "blocked" ? 403 : 400 });
    throw error;
  }
}
