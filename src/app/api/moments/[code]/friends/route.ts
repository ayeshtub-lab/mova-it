import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { FriendError, friendsToInvite } from "@/server/friends";

// Up to five friends (people you shared moments with) who are not in this moment yet.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ friends: await friendsToInvite(user, (await params).code) });
  } catch (error) {
    if (error instanceof FriendError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
