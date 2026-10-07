import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { reactionsFor } from "@/server/reactions";

// GET /api/likes?ids=a,b,c → the hearts now ({ count, liked } each, liked = mine), for a page
// that was shown from an old copy (back button, a restored tab) and must not show a heart
// as gone when it is there. Counts are public on the shots anyway; up to 100 at once.
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => /^[a-z0-9]{20,40}$/.test(id))
    .slice(0, 100);
  if (!ids.length) return NextResponse.json({});
  const user = await getCurrentUser();
  const likes = await reactionsFor(ids, user);
  return NextResponse.json(Object.fromEntries(likes), { headers: { "cache-control": "private, no-store" } });
}
