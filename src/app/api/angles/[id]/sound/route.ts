import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { refreshMontageForAngle } from "@/server/montage";
import { setAngleSound, SoundError } from "@/server/sounds";

// The moment's video is remade with the new sound after the response.
export const maxDuration = 300;

// Body: { soundKey: "n01" | null, muteOriginal?: boolean } — only the angle's contributor.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("soundKey" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { id } = await params;
  try {
    const result = await setAngleSound(user, id, body.soundKey, body.muteOriginal);
    const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
    after(() => refreshMontageForAngle(id, host).catch((error) => console.error("montage refresh failed", id, error)));
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof SoundError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400 });
  }
}
