import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { findJoinSuggestion } from "@/server/join";
import { limited } from "@/server/rate-limit";

// «صوّر معك» on its own (2026-10-24, his OK): asked by the phone right after the check, while its
// owner is already naming the shot — no longer inside the upload, where it added 7–15 seconds to
// every «عم نفحص». Only the shot's owner, a fresh shot (src/server/join.ts checks both).
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("lens", request, user.id);
  if (slow) return slow;
  const { id } = await params;
  const started = Date.now();
  const suggestion = await findJoinSuggestion(user.id, id);
  console.log("lens timing", JSON.stringify({ lensMs: Date.now() - started, found: !!suggestion }));
  return NextResponse.json({ suggestion });
}
