import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { PickError, setPick } from "@/server/picks";

// «⭐ اختيار زاومو» on (or off) for a shot — official (verified) accounts only. Body: { picked }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { picked?: unknown } | null;
  try {
    return NextResponse.json(await setPick(user, (await params).id, body?.picked));
  } catch (error) {
    if (!(error instanceof PickError)) throw error;
    const status = error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
}
