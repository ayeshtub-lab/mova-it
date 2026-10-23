import { NextResponse } from "next/server";
import { getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { inEnglish } from "@/server/localize";
import { SimilarError, similarShots } from "@/server/similar";

// May make the shot's vectors on the way (Gemini, a second or two).
export const maxDuration = 60;

// «📸 لقطات بتشبهها»: public shots that look like this one (visitors: from a public moment).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    // (An English visitor: each moment's English name — src/server/localize.ts.)
    const shots = inEnglish(await similarShots(user, (await params).id), await getLocale());
    return NextResponse.json({ shots }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SimilarError) return NextResponse.json({ error: error.code }, { status: 404 });
    throw error;
  }
}
