import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { CaptionError, clearCaption, setCaption } from "@/server/caption";
import { refreshMontageForAngle } from "@/server/montage";
import { limited } from "@/server/rate-limit";

// The moment's video is remade with the new writing after the response.
export const maxDuration = 300;

const failure = (error: unknown) => {
  if (!(error instanceof CaptionError)) throw error;
  const status = error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "check_failed" ? 503 : 400;
  return NextResponse.json({ error: error.code }, { status });
};

const remake = (request: Request, id: string) => {
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  after(() => refreshMontageForAngle(id, host).catch((error) => console.error("montage refresh failed", id, error)));
};

// Form: image (PNG), text, y, w, style (JSON) — only the shot's owner.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("caption", request, user.id);
  if (slow) return slow;
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!form || !(image instanceof Blob)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const caption = await setCaption(user, id, Buffer.from(await image.arrayBuffer()), { text: form.get("text"), y: form.get("y"), w: form.get("w"), style: form.get("style") });
    remake(request, id);
    return NextResponse.json({ caption });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await clearCaption(user, id);
    remake(request, id);
    return NextResponse.json({ caption: null });
  } catch (error) {
    return failure(error);
  }
}
