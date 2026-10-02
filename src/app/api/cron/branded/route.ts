import { NextResponse } from "next/server";
import { brandPending } from "@/server/branded";

// Each render takes a while (the whole clip is re-encoded once).
export const maxDuration = 300;

// Every 10 minutes (vercel.json): older videos get their stamped copy made ahead, a few per run.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const made = await brandPending(3);
  console.log("branded ahead", { made });
  return NextResponse.json({ made });
}
