import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { MontageError, momentVideoFor, requestMontage } from "@/server/montage";
import { renderMontage } from "@/server/montage/render";

// Rendering continues after the response (Fluid compute keeps the function alive);
// the page polls GET until the video is ready.
export const maxDuration = 300;

const failure = (error: unknown) => {
  if (!(error instanceof MontageError)) throw error;
  return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 403 });
};

// The moment's video as the page shows it.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await momentVideoFor(user, (await params).code));
  } catch (error) {
    return failure(error);
  }
}

// Make the video now, or remake it with another sound. Body: { soundKey }.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code } = await params;
  try {
    const body = await request.json().catch(() => null);
    const { montage, created } = await requestMontage(user, code, body?.soundKey ?? null);
    if (created) {
      // The public host the visitor used (not the internal deployment URL), for the link burnt into the video.
      const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      after(() => renderMontage(montage.id, host).catch((error) => console.error("montage failed", montage.id, error)));
    }
    return NextResponse.json(await momentVideoFor(user, code), { status: created ? 202 : 200 });
  } catch (error) {
    return failure(error);
  }
}
