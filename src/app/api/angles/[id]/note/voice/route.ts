import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, shotNote } from "@/server/angles";
import { limited } from "@/server/rate-limit";
import { VOICE_MAX_BYTES, voiceToText } from "@/server/voice-note";

// «🎤 احكيها بصوتك»: the shot's owner sends what they recorded (the body is the sound itself) and
// gets back their words written down. Nothing is saved here: the sound is dropped after Gemini
// hears it, and the words are saved only when the owner taps «احفظ» (POST /api/angles/[id]/note).
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await shotNote(user, (await params).id); // their own shot (or Zawmo's team), else not_found
  } catch (error) {
    if (error instanceof AngleError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
  const slow = await limited("voice", request, user.id);
  if (slow) return slow;
  const bytes = Buffer.from(await request.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (bytes.length < 500) return NextResponse.json({ error: "unclear" }, { status: 422 });
  if (bytes.length > VOICE_MAX_BYTES) return NextResponse.json({ error: "too_long" }, { status: 413 });
  const lang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "ar";
  const heard = await voiceToText(bytes, lang);
  if (heard.result === "ok") return NextResponse.json({ text: heard.text });
  return NextResponse.json({ error: heard.result }, { status: heard.result === "unclear" ? 422 : 503 });
}
