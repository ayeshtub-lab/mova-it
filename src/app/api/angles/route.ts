import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, prepareAngle } from "@/server/angles";

// Step 1 of an upload: reserve the angle and get the Blob paths to upload to.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    return NextResponse.json(await prepareAngle(user, body), { status: 201 });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    }
    throw error;
  }
}
