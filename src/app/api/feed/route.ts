import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listFeed } from "@/server/moments";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const feed = await listFeed(await getCurrentUser(), Number.isFinite(limit) ? limit : 20);
  return NextResponse.json({ moments: feed });
}
