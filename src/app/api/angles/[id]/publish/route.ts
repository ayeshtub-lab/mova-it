import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, publishAngle } from "@/server/angles";
import { afterWentLive } from "@/server/went-live";

// Making a video's stamped copy runs after the response (a minute or so).
// A moment's film may be made here (big films take minutes on the server).
export const maxDuration = 800;

// «نشر»: the owner publishes a checked draft; the moment's people hear of it, and the
// moment's video is remade after the response.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    // { title }: the name of a moment started without one (asked for at its first «نشر»).
    const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
    const angle = await publishAngle(user, id, body?.title);
    // Still being checked: published by the server when fine (the «complete» request).
    if (angle.status === "PROCESSING") return NextResponse.json({ id: angle.id, status: "PENDING" });
    const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
    after(() => afterWentLive(angle.id, host));
    return NextResponse.json({ id: angle.id, status: angle.status });
  } catch (error) {
    if (error instanceof AngleError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "needs_title" ? 400 : 409 });
    throw error;
  }
}
