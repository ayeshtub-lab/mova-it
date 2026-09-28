import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { FriendError, inviteFriends } from "@/server/friends";
import { limited } from "@/server/rate-limit";

// Body: { userIds: string[] } — friends to send this moment to.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("invite", request, user.id);
  if (slow) return slow;
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await inviteFriends(user, (await params).code, body?.userIds));
  } catch (error) {
    if (error instanceof FriendError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 403 });
    }
    throw error;
  }
}
