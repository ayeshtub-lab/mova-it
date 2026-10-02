import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { UserSoundError, withdrawSound } from "@/server/user-sounds";

// The owner takes their sound back.
export async function DELETE(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await withdrawSound(user, (await params).key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UserSoundError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
