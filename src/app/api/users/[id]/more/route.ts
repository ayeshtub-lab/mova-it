import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ProfileError, profileMore, type ProfileList } from "@/server/profile";

const LISTS: ProfileList[] = ["shots", "moments", "likes", "saved"];

// GET /api/users/ID/more?list=shots|moments|likes|saved&from=60 → { items, more }: «عرض المزيد»
// on a profile (src/app/u/[id]/ProfileTabs.tsx). Liked and saved answer their owner only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const query = new URL(request.url).searchParams;
  const list = query.get("list") as ProfileList;
  if (!LISTS.includes(list)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const page = await profileMore(await getCurrentUser(), (await params).id, list, Number(query.get("from")));
    return NextResponse.json(page, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "invalid" ? 400 : 404 });
  }
}
