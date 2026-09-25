import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ReactionError, setSaved } from "@/server/reactions";

// Body: { saved: true } to add to «المحفوظات», { saved: false } to remove.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("saved" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { id } = await params;
  try {
    return NextResponse.json(await setSaved(user, id, body.saved));
  } catch (error) {
    if (error instanceof ReactionError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    }
    throw error;
  }
}
