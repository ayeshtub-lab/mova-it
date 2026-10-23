import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sharedCard } from "@/server/cards";
import { limited } from "@/server/rate-limit";

// A public card sent on: counted, so the most sent come first on /cards.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const slow = await limited("react", request, user?.id);
  if (slow) return slow;
  await sharedCard((await params).id);
  return NextResponse.json({ ok: true });
}
