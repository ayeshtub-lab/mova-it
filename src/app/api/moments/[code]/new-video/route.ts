import { NextResponse } from "next/server";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { MontageError, newShotsVideoUrl } from "@/server/montage";
import { limited } from "@/server/rate-limit";

// Made inside the request (it is short, and kept once made).
export const maxDuration = 300;

// «🆕 فيديو الجديد»: a short film of the shots the latest version of the moment's video added.
// Returns { url } — a short-lived link to the file, to play, share or save.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("montage", request, user.id);
  if (slow) return slow;
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  const dict = await getDictionary(await getLocale());
  try {
    return NextResponse.json({ url: await newShotsVideoUrl(user, (await params).code, host, dict.montage.newKicker) });
  } catch (error) {
    if (!(error instanceof MontageError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
  }
}
