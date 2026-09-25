import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setAngleSound, SoundError } from "@/server/sounds";

// Body: { soundKey: "n01" | null, muteOriginal?: boolean } — only the angle's contributor.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("soundKey" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    return NextResponse.json(await setAngleSound(user, (await params).id, body.soundKey, body.muteOriginal));
  } catch (error) {
    if (!(error instanceof SoundError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400 });
  }
}
