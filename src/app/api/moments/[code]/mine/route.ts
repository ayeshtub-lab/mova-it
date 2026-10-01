import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deleteMyShots } from "@/server/angles";

// «احذف لقطاتي من هاللحظة»: every shot of the signed-in person in this moment, at once.
export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await deleteMyShots(user, (await params).code));
}
