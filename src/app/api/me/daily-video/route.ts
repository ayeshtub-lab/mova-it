import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// «اسمح تطلع صوري بفيديو لحظة اليوم» ({ allow: boolean }).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.isGuest) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { allow?: unknown } | null;
  if (typeof body?.allow !== "boolean") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  await db.user.update({ where: { id: user.id }, data: { dailyVideo: body.allow } });
  return NextResponse.json({ allow: body.allow });
}
