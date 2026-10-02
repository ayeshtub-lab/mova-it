import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limited } from "@/server/rate-limit";
import { offerSound, UserSoundError } from "@/server/user-sounds";

// Listening to the sound (two checks) takes a little while.
export const maxDuration = 120;

// «🎤 خلّي صوتي عام»: the owner of a video in a public moment makes its sound public.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.isGuest) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("montage", request, user.id);
  if (slow) return slow;
  try {
    const sound = await offerSound(user, (await params).id);
    return NextResponse.json({ key: sound.key, status: sound.status, reason: sound.reason, name: sound.name });
  } catch (error) {
    if (error instanceof UserSoundError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    throw error;
  }
}
