import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { MontageError, setMomentLike } from "@/server/montage";

// A heart on the moment's video. Body: { liked: boolean }.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await setMomentLike(user, (await params).code, body?.liked === true));
  } catch (error) {
    if (!(error instanceof MontageError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 403 });
  }
}
