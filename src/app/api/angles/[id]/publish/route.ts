import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, publishAngle } from "@/server/angles";
import { refreshMontageForAngle } from "@/server/montage";
import { notifyNewAngle } from "@/server/notifications";

// «نشر»: the owner publishes a checked draft; the moment's people hear of it, and the
// moment's video is remade after the response.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const angle = await publishAngle(user, id);
    after(() => notifyNewAngle(angle.id));
    const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
    after(() => refreshMontageForAngle(angle.id, host).catch((error) => console.error("montage refresh failed", angle.id, error)));
    return NextResponse.json({ id: angle.id, status: angle.status });
  } catch (error) {
    if (error instanceof AngleError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    throw error;
  }
}
