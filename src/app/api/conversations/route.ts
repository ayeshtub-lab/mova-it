import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Block } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

// جلب قائمة المحادثات الخاصة بالمستخدم
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const conversations = await db.conversation.findMany({
      where: {
        OR: [
          { user1Id: user.id },
          { user2Id: user.id },
        ],
      },
      include: {
        user1: { select: { id: true, displayName: true, avatarUrl: true } },
        user2: { select: { id: true, displayName: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // تصفية المحادثات مع المحظورين
    const blockedUsers = await db.block.findMany({
      where: {
        OR: [
          { blockerId: user.id },
          { blockedId: user.id },
        ],
      },
    });

    const blockedIds = new Set<string>();
    blockedUsers.forEach((block: Block) => {
      if (block.blockerId === user.id) {
        blockedIds.add(block.blockedId);
      } else {
        blockedIds.add(block.blockerId);
      }
    });

    const filtered = conversations.filter((conv) => {
      const otherId = conv.user1Id === user.id ? conv.user2Id : conv.user1Id;
      return !blockedIds.has(otherId);
    });

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("خطأ في جلب المحادثات:", error);
    return NextResponse.json(
      { error: "خطأ في جلب المحادثات" },
      { status: 500 }
    );
  }
}

// بدء محادثة جديدة مع مستخدم
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const { userId } = await req.json();

    if (!userId || userId === user.id) {
      return NextResponse.json(
        { error: "معرف مستخدم غير صحيح" },
        { status: 400 }
      );
    }

    // التحقق من أن المستخدم الآخر موجود
    const otherUser = await db.user.findUnique({
      where: { id: userId },
    });

    if (!otherUser) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    // التحقق من الحجب
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: userId },
          { blockerId: userId, blockedId: user.id },
        ],
      },
    });

    if (blocked) {
      return NextResponse.json(
        { error: "لا يمكن المراسلة" },
        { status: 403 }
      );
    }

    // ترتيب المعرفات لضمان محادثة واحدة فقط
    const [user1Id, user2Id] = [user.id, userId].sort();

    // البحث عن محادثة موجودة أو إنشاء واحدة جديدة
    const conversation = await db.conversation.upsert({
      where: {
        user1Id_user2Id: { user1Id, user2Id },
      },
      create: {
        user1Id,
        user2Id,
      },
      update: {},
      include: {
        user1: { select: { id: true, displayName: true, avatarUrl: true } },
        user2: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("خطأ في إنشاء محادثة:", error);
    return NextResponse.json(
      { error: "خطأ في إنشاء محادثة" },
      { status: 500 }
    );
  }
}
