import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { joinMoment, JoinError } from "@/server/join";
import { refreshMontageForAngle } from "@/server/montage";

// «صوّر معك»: the shot's owner adds it to the moment they were offered ({ code }).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  if (typeof body?.code !== "string") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { id } = await params;
  try {
    const done = await joinMoment(user.id, id, body.code);
    const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
    after(() => refreshMontageForAngle(id, host).catch((error) => console.error("montage refresh failed", id, error)));
    return NextResponse.json(done);
  } catch (error) {
    if (error instanceof JoinError) return NextResponse.json({ error: error.code }, { status: 409 });
    throw error;
  }
}
