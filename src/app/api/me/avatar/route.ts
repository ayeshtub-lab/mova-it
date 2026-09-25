import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ProfileError, setAvatar } from "@/server/profile";

export const maxDuration = 60;

// Body: the new profile photo as image/jpeg (already cropped square by the browser).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const bytes = Buffer.from(await request.arrayBuffer());
  try {
    return NextResponse.json({ avatarUrl: await setAvatar(user, bytes) });
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "blocked" ? 422 : error.code === "forbidden" ? 403 : 400 });
  }
}
