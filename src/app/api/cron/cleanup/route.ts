import { NextResponse } from "next/server";
import { purgeStaleUploads } from "@/server/angles";

// Daily (vercel.json): unpublished drafts and empty moments older than a day.
// Vercel's scheduler sends the secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const done = await purgeStaleUploads();
  console.log("cleanup", done);
  return NextResponse.json(done);
}
