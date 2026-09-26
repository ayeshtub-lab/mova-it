import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setAngleLook, SoundError } from "@/server/sounds";

// Body: { filter: "warm" | null, stamp: boolean } — only the angle's contributor.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await setAngleLook(user, (await params).id, body?.filter ?? null, body?.stamp));
  } catch (error) {
    if (!(error instanceof SoundError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400 });
  }
}
