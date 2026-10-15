import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ChatError, listConversations, startConversation } from "@/server/conversations";

// The person's conversations, newest activity first (src/server/conversations.ts).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listConversations(user));
}

// { userId }: the conversation with that person — found, or started.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  try {
    return NextResponse.json({ id: await startConversation(user, body?.userId) });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "blocked" ? 403 : 400 });
    throw error;
  }
}
