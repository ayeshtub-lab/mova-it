import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { BrandedError, brandedShotUrl } from "@/server/branded";
import { limited } from "@/server/rate-limit";

// Making the video can take a little while (the whole clip is re-encoded once, then kept).
export const maxDuration = 300;

// «📤 شارك بختم زاومو»: the owner's video shot with the Zawmo mark and closing card.
// Answers { url } (a short-lived link to the file) once it's ready.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("branded", request, user.id);
  if (slow) return slow;
  // The public host the visitor used, for the link burnt into the video.
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  try {
    const url = await brandedShotUrl(user, (await params).id, host);
    if (!url) return NextResponse.json({ error: "failed" }, { status: 500 });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof BrandedError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    console.error("branded video failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
