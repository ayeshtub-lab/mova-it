import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { peopleSounds } from "@/server/user-sounds";

// «🎤 من الناس» in the sound picker: the viewer's own sounds (shared or «🔒 خاص») first, then
// everyone's shared ones. Different for each person: never cached.
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await peopleSounds(user?.id ?? null), { headers: { "cache-control": "private, no-store" } });
}
