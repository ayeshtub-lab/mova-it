import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { MarkedError, markedPhotoUrl } from "@/server/marked";
import { limited } from "@/server/rate-limit";

export const maxDuration = 60;

// «📤 شارك بختم زاومو» for a photo: { url } of the marked copy (made once, then kept).
// Anyone who can see the photo — visitors too, for public moments.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const slow = await limited("branded", request, user?.id ?? null);
  if (slow) return slow;
  try {
    const url = await markedPhotoUrl(user, (await params).id);
    if (!url) return NextResponse.json({ error: "failed" }, { status: 500 });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof MarkedError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    console.error("marked photo failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
