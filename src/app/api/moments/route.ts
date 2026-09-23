import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createMoment, MomentError } from "@/server/moments";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const moment = await createMoment(user, body);
    return NextResponse.json({ code: moment.code }, { status: 201 });
  } catch (error) {
    if (error instanceof MomentError) return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
}
