import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, deleteAngle } from "@/server/angles";

// Delete an angle: its own contributor, or the creator of its moment.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await deleteAngle(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AngleError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
