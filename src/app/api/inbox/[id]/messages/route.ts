import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { InboxError, messagesSince, sendMessage } from "@/server/inbox";
import { limited } from "@/server/rate-limit";

// ?since=ISO — new messages while the thread is open (it polls while on screen).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("since");
  const since = raw ? new Date(raw) : new Date(0);
  if (Number.isNaN(since.getTime())) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const messages = await messagesSince(user, (await params).id, since);
  return messages ? NextResponse.json(messages) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

// Body: { body: "text" } — a quick reply in an inbox thread.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("message", request, user.id);
  if (slow) return slow;
  const payload = await request.json().catch(() => null);
  try {
    return NextResponse.json(await sendMessage(user, (await params).id, payload?.body), { status: 201 });
  } catch (error) {
    if (!(error instanceof InboxError)) throw error;
    const status = error.code === "not_found" ? 404 : error.code === "too_many" ? 429 : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
}
