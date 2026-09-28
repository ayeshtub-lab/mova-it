import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setAnglePlace } from "@/server/places";

// The owner of a shot removes its place ({ placeId: null }) or picks another one.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("placeId" in body)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const done = await setAnglePlace(user, (await params).id, (body as { placeId: unknown }).placeId);
  if (!done) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(done);
}
