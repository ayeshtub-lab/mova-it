import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, completeAngle } from "@/server/angles";
import { findJoinSuggestion } from "@/server/join";
import { makeSmall } from "@/server/small";
import { sendToStream } from "@/server/stream";

// The automatic content check runs inside this request (a few seconds). A fine shot becomes
// a draft; «صوّر معك» looks for a matching moment; the owner then publishes (./publish).
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
    // Videos: a copy to Cloudflare Stream (every phone, adaptive quality), after the response.
    if (angle.mediaType === "VIDEO" && angle.status !== "HIDDEN") after(() => sendToStream(angle.id).catch((error) => console.error("stream copy failed", angle.id, error)));
    // «صوّر معك»: someone nearby shot the same moment just now? Offer to add this shot to it.
    const suggestion = angle.status === "DRAFT" ? await findJoinSuggestion(user.id, angle.id) : null;
    return NextResponse.json({ id: angle.id, status: angle.status, suggestion });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    }
    throw error;
  }
}
