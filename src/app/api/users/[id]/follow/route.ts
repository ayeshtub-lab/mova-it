import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ProfileError, setFollow } from "@/server/profile";

async function handle(on: boolean, params: Promise<{ id: string }>) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await setFollow(user, (await params).id, on);
    return NextResponse.json({ following: on });
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 400 });
  }
}

export const POST = (_request: Request, { params }: { params: Promise<{ id: string }> }) => handle(true, params);
export const DELETE = (_request: Request, { params }: { params: Promise<{ id: string }> }) => handle(false, params);
