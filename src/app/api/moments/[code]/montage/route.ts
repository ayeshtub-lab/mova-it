import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { MontageError, montageView, requestMontage } from "@/server/montage";
import { renderMontage } from "@/server/montage/render";

// Rendering continues after the response (Fluid compute keeps the function alive);
// the page polls GET /api/montages/[id] until it is ready.
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code } = await params;
  try {
    const { montage, created } = await requestMontage(user, code);
    if (created) {
      // The public host the visitor used (not the internal deployment URL), for the link burnt into the video.
      const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      after(() => renderMontage(montage.id, host).catch((error) => console.error("montage failed", montage.id, error)));
    }
    return NextResponse.json(await montageView(montage), { status: created ? 202 : 200 });
  } catch (error) {
    if (error instanceof MontageError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 403 });
    }
    throw error;
  }
}
