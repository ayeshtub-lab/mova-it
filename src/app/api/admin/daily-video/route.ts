import { NextResponse } from "next/server";
import { getDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { CANONICAL_HOST } from "@/lib/hosts";
import { DailyVideoError, dailyVideoUrl } from "@/server/daily-video";

// Making the film can take a minute or two the first time (it is kept afterwards).
export const maxDuration = 300;

// ?code=… — an admin downloads that day's «لحظة اليوم» film (redirected to the file).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const code = new URL(request.url).searchParams.get("code") ?? "";
  try {
    const dict = await getDictionary("ar");
    const url = await dailyVideoUrl(code, CANONICAL_HOST, dict.daily.videoKicker);
    if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof DailyVideoError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    throw error;
  }
}
