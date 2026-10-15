import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { friendsOf } from "@/server/friends";
import { blockedIdsFor } from "@/server/moderation";

// The people to start a conversation with, or send a shot to: the ones you shared a moment with
// first (the closest), then the ones you follow — never someone blocked either way.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [together, follows, blocked] = await Promise.all([
    friendsOf(user, 60),
    db.follow.findMany({ where: { followerId: user.id }, orderBy: { createdAt: "desc" }, take: 100, select: { followingId: true } }),
    blockedIdsFor(user.id),
  ]);
  const ids = [...new Set([...together.map((f) => f.id), ...follows.map((f) => f.followingId)])].filter((id) => !blocked.has(id) && id !== user.id);
  const people = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, avatarUrl: true, verified: true } });
  return NextResponse.json(ids.map((id) => people.find((p) => p.id === id)).filter(Boolean));
}
