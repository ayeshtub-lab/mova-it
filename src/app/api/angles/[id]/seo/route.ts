import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, updateShotSeo } from "@/server/angles";

// «✏️ عنوان ووصف اللقطة»: Zawmo's own accounts fix a public shot's title and line ({ title, text }).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { title?: unknown; text?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    return NextResponse.json(await updateShotSeo(user, (await params).id, body));
  } catch (error) {
    if (!(error instanceof AngleError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
  }
}
