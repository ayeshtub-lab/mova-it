import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";

// الحصول على بيانات الجلسة الحالية
export async function GET() {
  const user = await getCurrentUser();

  if (!user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  return NextResponse.json({
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });
}
