import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ProfileError, setFollow } from "@/server/profile";
import { limited } from "@/server/rate-limit";

async function handle(on: boolean, request: Request, params: Promise<{ id: string }>) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("follow", request, user.id);
  if (slow) return slow;
  try {
    await setFollow(user, (await params).id, on);
    return NextResponse.json({ following: on });
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
  }
}

export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => handle(true, request, params);
export const DELETE = (request: Request, { params }: { params: Promise<{ id: string }> }) => handle(false, request, params);
