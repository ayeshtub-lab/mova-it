import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, setShotNote, shotNote } from "@/server/angles";
import { limited } from "@/server/rate-limit";

// «✍️ احكي عن صورتك»: the shot's owner reads (GET) and writes (POST { note }) their own words.
const failure = (error: unknown) => {
  if (!(error instanceof AngleError)) throw error;
  return NextResponse.json({ error: error.code, ...(error.hint ? { hint: error.hint } : {}) }, { status: error.code === "not_found" ? 404 : error.code === "note_failed" ? 503 : 400 });
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await shotNote(user, (await params).id));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("details", request, user.id);
  if (slow) return slow;
  const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    return NextResponse.json(await setShotNote(user, (await params).id, body.note));
  } catch (error) {
    return failure(error);
  }
}
