import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { cardIdeas } from "@/server/cards";
import { limited } from "@/server/rate-limit";

// «💌 بطاقة»: Gemini's lines for a public shot's picture (src/server/cards.ts) — anyone may ask,
// the same picture's lines are kept a week.
export async function GET(request: Request) {
  const shot = new URL(request.url).searchParams.get("shot") ?? "";
  if (!/^[a-z0-9]{20,40}$/.test(shot)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await getCurrentUser();
  const slow = await limited("cardIdeas", request, user?.id);
  if (slow) return slow;
  const ideas = await cardIdeas(shot).catch((error) => (console.error("card ideas failed", error), []));
  return NextResponse.json({ ideas });
}
