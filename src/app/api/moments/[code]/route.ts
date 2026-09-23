import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getMomentView } from "@/server/moments";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const view = await getMomentView(code, await getCurrentUser());
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}
