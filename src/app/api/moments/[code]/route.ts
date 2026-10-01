import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getMomentView } from "@/server/moments";
import { AngleError, deleteMoment } from "@/server/angles";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const view = await getMomentView(code, await getCurrentUser());
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}

// «احذف اللحظة كاملة» — its creator only.
export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await deleteMoment(user, (await params).code));
  } catch (error) {
    if (error instanceof AngleError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
