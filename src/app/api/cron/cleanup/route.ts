import { NextResponse } from "next/server";
import { restNow } from "@/lib/night-rest";
import { purgeStaleUploads, repairBlackCovers } from "@/server/angles";
import { remindDrafts } from "@/server/drafts";
import { purgeRateLimits } from "@/server/rate-limit";
import { embedPending } from "@/server/similar";
import { syncStream } from "@/server/stream";

export const maxDuration = 300;

// Hourly (vercel.json): unpublished drafts (48 h, reminded after 1 h) and empty moments (3 h), the Stream
// safety net (videos without a copy, copies still encoding), old rate-limit counts, and black video covers.
// Vercel's scheduler sends the secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The night rest (src/lib/night-rest.ts): one run an hour from 01:00 to 07:00, the database asleep between.
  if (restNow()) return NextResponse.json({ resting: true });
  const done = {
    ...(await purgeStaleUploads()),
    draftsReminded: await remindDrafts().catch((error) => (console.error("draft reminders failed", error), 0)),
    stream: await syncStream().catch((error) => ({ error: String(error) })),
    rateLimitRows: await purgeRateLimits().catch(() => 0),
    // «📸 لقطات بتشبهها»: public shots still without vectors (the older ones, then any missed).
    embedded: await embedPending().catch(() => 0),
    // Videos whose cover came out black (src/server/angles.ts repairBlackCover).
    blackCovers: await repairBlackCovers().catch((error) => ({ error: String(error) })),
  };
  console.log("cleanup", done);
  return NextResponse.json(done);
}
