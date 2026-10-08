import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ModerationError, reportContent } from "@/server/moderation";
import { limited } from "@/server/rate-limit";

// Body: { angleId | commentId, reason: "OFFENSIVE"|"SPAM"|"PRIVACY"|"COPYRIGHT"|"OTHER", note?, block? }
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("report", request, user.id);
  if (slow) return slow;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    await reportContent(user, body);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ModerationError) {
      const status = { not_found: 404, invalid: 400, too_many: 429, forbidden: 403 }[error.code];
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }
}
