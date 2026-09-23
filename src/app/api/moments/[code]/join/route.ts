import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { joinMoment, MomentError } from "@/server/moments";

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code } = await params;
  try {
    await joinMoment(code, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MomentError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
