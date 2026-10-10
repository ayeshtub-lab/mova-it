import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// جلب قائمة الأصدقاء (الأشخاص الذي يتابعهم المستخدم)
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    // جلب الأصدقاء (الأشخاص الذي يتابعهم المستخدم)
    const friends = await db.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // تصفية الأصدقاء المحظورين
    const blocked = await db.block.findMany({
      where: {
        OR: [
          { blockerId: user.id },
          { blockedId: user.id },
        ],
      },
    });

    const blockedIds = new Set<string>();
    blocked.forEach((block) => {
      if (block.blockerId === user.id) {
        blockedIds.add(block.blockedId);
      } else {
        blockedIds.add(block.blockerId);
      }
    });

    const filteredFriends = friends
      .filter((f) => !blockedIds.has(f.following.id))
      .map((f) => f.following);

    return NextResponse.json(filteredFriends);
  } catch (error) {
    console.error("خطأ في جلب الأصدقاء:", error);
    return NextResponse.json(
      { error: "خطأ في جلب الأصدقاء" },
      { status: 500 }
    );
  }
}
