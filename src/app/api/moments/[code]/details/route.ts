import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { MomentError, updateMomentDetails } from "@/server/moments";

// «تعديل»: the creator changes the moment's title and description ({ title, description }).
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { title?: unknown; description?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    const m = await updateMomentDetails(user, (await params).code, body);
    return NextResponse.json({ title: m.title, description: m.description });
  } catch (error) {
    if (!(error instanceof MomentError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400 });
  }
}
