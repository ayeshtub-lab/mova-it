import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AngleError, deleteAngle } from "@/server/angles";
import { refreshMontage } from "@/server/montage";

// The moment's video is remade without the deleted angle after the response.
export const maxDuration = 300;

// Delete an angle: its own contributor, or the creator of its moment.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const angle = await db.angle.findUnique({ where: { id }, select: { momentId: true } });
    await deleteAngle(user, id);
    if (angle) {
      const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      after(() => refreshMontage(angle.momentId, host).catch((error) => console.error("montage refresh failed", angle.momentId, error)));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AngleError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
