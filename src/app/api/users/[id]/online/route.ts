import { isUserOnline } from "@/server/presence";
import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "معرف مستخدم مفقود" }, { status: 400 });
  }

  try {
    const online = await isUserOnline(id);
    return NextResponse.json({ isOnline: online });
  } catch (error) {
    console.error("خطأ في التحقق من حالة التواجد:", error);
    return NextResponse.json(
      { error: "خطأ في التحقق من حالة التواجد" },
      { status: 500 }
    );
  }
}
