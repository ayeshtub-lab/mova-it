import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, setVideoCover } from "@/server/angles";
import { allowedFor } from "@/server/rate-limit";

// «🖼️ الغلاف»: a frame of the person's own video, chosen on their phone, becomes its cover.
// Body: the JPEG itself (at most 2 MB).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowedFor("uploadToken", request.headers, user.id))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  if (request.headers.get("content-type") !== "image/jpeg") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const bytes = Buffer.from(await request.arrayBuffer());
  const { id } = await params;
  try {
    await setVideoCover(user, id, bytes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!(error instanceof AngleError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
  }
}
