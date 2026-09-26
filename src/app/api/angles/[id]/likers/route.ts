import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ReactionError, recentLikers } from "@/server/reactions";

// The latest names who liked this angle — its contributor only.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ names: await recentLikers(user, (await params).id) });
  } catch (error) {
    if (error instanceof ReactionError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
