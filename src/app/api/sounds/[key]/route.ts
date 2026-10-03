import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setSoundShared, UserSoundError, withdrawSound } from "@/server/user-sounds";

// The owner switches their sound between everyone and «🔒 خاص». Body: { shared: boolean }.
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.shared !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const sound = await setSoundShared(user, (await params).key, body.shared);
    return NextResponse.json({ shared: sound.shared });
  } catch (error) {
    if (error instanceof UserSoundError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}

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
