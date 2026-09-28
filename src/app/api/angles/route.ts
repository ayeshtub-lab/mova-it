import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, prepareAngle } from "@/server/angles";
import { networkFrom } from "@/server/network-place";
import { limited } from "@/server/rate-limit";

// Step 1 of an upload: reserve the angle and get the Blob paths to upload to.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("upload", request, user.id);
  if (slow) return slow;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    // Vercel's guess of the uploader's country: compared with the shot's place, never stored.
    const network = networkFrom(request.headers);
    return NextResponse.json(await prepareAngle(user, body, network.country, network.placeId), { status: 201 });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
    }
    throw error;
  }
}
