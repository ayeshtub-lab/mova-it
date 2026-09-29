import { NextResponse } from "next/server";
import { purgeStaleUploads } from "@/server/angles";
import { purgeRateLimits } from "@/server/rate-limit";
import { syncStream } from "@/server/stream";

export const maxDuration = 300;

// Hourly (vercel.json): unpublished drafts and empty moments older than 3 hours, the Stream
// safety net (videos without a copy, copies still encoding), and old rate-limit counts.
// Vercel's scheduler sends the secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const done = {
    ...(await purgeStaleUploads()),
    stream: await syncStream().catch((error) => ({ error: String(error) })),
    rateLimitRows: await purgeRateLimits().catch(() => 0),
  };
  console.log("cleanup", done);
  return NextResponse.json(done);
}
