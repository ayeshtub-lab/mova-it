import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, completeAngle } from "@/server/angles";
import { refreshMontageForAngle } from "@/server/montage";
import { notifyNewAngle } from "@/server/notifications";
import { findJoinSuggestion } from "@/server/join";
import { makeSmall } from "@/server/small";

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
    // The small copy for grids (photos), after the response; until then grids use the photo.
    after(() => makeSmall(angle.id).catch((error) => console.error("small copy failed", angle.id, error)));
    if (angle.status === "READY") {
      after(() => notifyNewAngle(angle.id));
      const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      after(() => refreshMontageForAngle(angle.id, host).catch((error) => console.error("montage refresh failed", angle.id, error)));
    }
    // «صوّر معك»: someone nearby shot the same moment just now? Offer to add this shot to it.
    const suggestion = angle.status === "READY" ? await findJoinSuggestion(user.id, angle.id) : null;
    return NextResponse.json({ id: angle.id, status: angle.status, suggestion });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    }
    throw error;
  }
}
