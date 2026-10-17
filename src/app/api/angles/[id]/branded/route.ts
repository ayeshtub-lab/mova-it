import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { BrandedError, brandedShotUrl } from "@/server/branded";
import { limited } from "@/server/rate-limit";

// Making the video can take a little while (the whole clip is re-encoded once, then kept).
export const maxDuration = 300;

// «📤 شارك بختم زاومو»: a video shot with the Zawmo mark and closing card — its owner's, or a public
// one for anyone (a visitor too: src/server/branded.ts). Answers { url } (a short-lived link to the
// file) once it's ready.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const slow = await limited("branded", request, user?.id);
  if (slow) return slow;
  try {
    const url = await brandedShotUrl(user, (await params).id);
    if (!url) return NextResponse.json({ error: "failed" }, { status: 500 });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof BrandedError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    console.error("branded video failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
