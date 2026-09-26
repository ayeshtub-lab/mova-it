import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, completeAngle } from "@/server/angles";
import { refreshMontageForAngle } from "@/server/montage";

// The automatic content check runs inside this request (a few seconds); the moment's
// video is then remade after the response.
export const maxDuration = 300;

// Step 3: the device says the upload finished; the server checks the files exist.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const angle = await completeAngle(user, id);
    if (angle.status === "READY") {
      const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      after(() => refreshMontageForAngle(angle.id, host).catch((error) => console.error("montage refresh failed", angle.id, error)));
    }
    return NextResponse.json({ id: angle.id, status: angle.status });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    }
    throw error;
  }
}
