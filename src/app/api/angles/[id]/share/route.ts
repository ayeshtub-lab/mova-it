import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { visibleAngle } from "@/server/access";

// Counts a tap on «share» (for «الأكثر رواجًا هذا الأسبوع»). Anyone who can see the
// angle may share it; visitors on public moments too.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const visible = user
    ? await visibleAngle(user, id)
    : await db.angle.findFirst({ where: { id, status: "READY", moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" } } }, select: { id: true } });
  if (!visible) return new NextResponse(null, { status: 404 });
  await db.angle.update({ where: { id }, data: { shares: { increment: 1 } } });
  return new NextResponse(null, { status: 204 });
}
