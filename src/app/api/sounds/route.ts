import { isCurator } from "@/server/sound-resolve";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limited } from "@/server/rate-limit";
import { addSound, UserSoundError } from "@/server/user-sounds";

// The Gemini check (and AudD's) runs inside this request.
export const maxDuration = 120;

// «🎤 صوتك»: a member adds a sound from the picker. Form: file (a recording or a sound file),
// name (optional), shared ("true" = for everyone, "false" = «🔒 خاص»).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // A curator filling the library adds without the hourly limit (each sound is still checked).
  const slow = isCurator(user) ? null : await limited("sound", request, user.id);
  if (slow) return slow;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) return NextResponse.json({ error: "no_audio" }, { status: 400 });
  try {
    const sound = await addSound(user, Buffer.from(await file.arrayBuffer()), { name: form.get("name"), shared: form.get("shared") });
    return NextResponse.json({ key: sound.key, name: sound.name, status: sound.status, reason: sound.reason, shared: sound.shared, seconds: sound.seconds });
  } catch (error) {
    if (!(error instanceof UserSoundError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "members_only" ? 403 : 400 });
  }
}
