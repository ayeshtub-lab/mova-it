import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ProfileError, recordViews } from "@/server/profile";

// Body: { ids: ["angleId", …] } — angles the viewer just looked at (up to 20).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  try {
    return NextResponse.json(await recordViews(user, payload?.ids));
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return NextResponse.json({ error: error.code }, { status: 400 });
  }
}
