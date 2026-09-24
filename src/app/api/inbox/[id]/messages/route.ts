import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { InboxError, sendMessage } from "@/server/inbox";

// Body: { body: "text" } — a quick reply in an inbox thread.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  try {
    return NextResponse.json(await sendMessage(user, (await params).id, payload?.body), { status: 201 });
  } catch (error) {
    if (!(error instanceof InboxError)) throw error;
    const status = error.code === "not_found" ? 404 : error.code === "too_many" ? 429 : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
}
