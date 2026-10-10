import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// جلب الرسائل في محادثة
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // التحقق من أن المستخدم طرف في المحادثة
    const conversation = await db.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 }
      );
    }

    const isParticipant =
      conversation.user1Id === user.id ||
      conversation.user2Id === user.id;

    if (!isParticipant) {
      return NextResponse.json({ error: "ممنوع" }, { status: 403 });
    }

    // جلب الرسائل
    const messages = await db.message.findMany({
      where: { conversationId: id },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      skip: 0,
    });

    // تحديث وقت آخر ظهور
    if (conversation.user1Id === user.id) {
      await db.conversation.update({
        where: { id },
        data: { user1SeenAt: new Date() },
      });
    } else {
      await db.conversation.update({
        where: { id },
        data: { user2SeenAt: new Date() },
      });
    }

    return NextResponse.json(messages);
  } catch (error) {
    console.error("خطأ في جلب الرسائل:", error);
    return NextResponse.json(
      { error: "خطأ في جلب الرسائل" },
      { status: 500 }
    );
  }
}

// إرسال رسالة جديدة
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { body } = await req.json();

    if (!body || typeof body !== "string" || !body.trim()) {
      return NextResponse.json(
        { error: "الرسالة فارغة" },
        { status: 400 }
      );
    }

    // التحقق من أن المستخدم طرف في المحادثة
    const conversation = await db.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 }
      );
    }

    const isParticipant =
      conversation.user1Id === user.id ||
      conversation.user2Id === user.id;

    if (!isParticipant) {
      return NextResponse.json({ error: "ممنوع" }, { status: 403 });
    }

    // التحقق من الحجب
    const otherId =
      conversation.user1Id === user.id
        ? conversation.user2Id
        : conversation.user1Id;

    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: otherId },
          { blockerId: otherId, blockedId: user.id },
        ],
      },
    });

    if (blocked) {
      return NextResponse.json(
        { error: "لا يمكن المراسلة" },
        { status: 403 }
      );
    }

    // إنشاء الرسالة
    const message = await db.message.create({
      data: {
        conversationId: id,
        senderId: user.id,
        body: body.trim(),
      },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // تحديث وقت آخر نشاط للمحادثة
    await db.conversation.update({
      where: { id },
      data: { createdAt: new Date() },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("خطأ في إرسال الرسالة:", error);
    return NextResponse.json(
      { error: "خطأ في إرسال الرسالة" },
      { status: 500 }
    );
  }
}
