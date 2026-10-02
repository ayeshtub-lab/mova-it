import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { brandAfterChange } from "@/server/branded";
import { refreshMontageForAngle } from "@/server/montage";
import { setAngleSound, SoundError } from "@/server/sounds";

// The moment's video is remade with the new sound after the response.
export const maxDuration = 300;

// Body: { soundKey: "n01" | null, muteOriginal?: boolean, lyrics?: boolean (its words on it; default on) } — only the angle's contributor.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("soundKey" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { id } = await params;
  try {
    const result = await setAngleSound(user, id, body.soundKey, body.muteOriginal, body.lyrics);
    const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
    after(() => refreshMontageForAngle(id, host).catch((error) => console.error("montage refresh failed", id, error)));
    // Its stamped copy (what a share sends) made again now, with the new sound.
    after(() => brandAfterChange(id));
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof SoundError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400 });
  }
}
