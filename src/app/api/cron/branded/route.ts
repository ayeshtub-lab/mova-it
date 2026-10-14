import { NextResponse } from "next/server";
import { brandPending } from "@/server/branded";
import { markPending } from "@/server/marked";
import { describePending, recheckUnscreened } from "@/server/angles";
import { stampWeather } from "@/server/weather";

// Each render takes a while (the whole clip is re-encoded once).
export const maxDuration = 300;

// Every 10 minutes (vercel.json): fresh shots get the weather they were taken in (quick, a few
// calls), then older videos get their stamped copy made ahead, a few per run, and photos with a
// sound their shared video. A weather failure never stops the videos.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const weather = await stampWeather().catch((error) => {
    console.error("weather failed", error);
    return 0;
  });
  // Shots whose automatic check failed: checked again (src/server/angles.ts).
  const rechecked = await recheckUnscreened().catch((error) => {
    console.error("recheck failed", error);
    return 0;
  });
  // Public shots given their SEO title and words (the rules of 2026-10-14), a few per run.
  const described = await describePending().catch((error) => {
    console.error("describe pending failed", error);
    return 0;
  });
  const made = await brandPending(3);
  const photos = await markPending(2);
  console.log("branded ahead", { made, photos, weather, rechecked, described });
  return NextResponse.json({ made, photos, weather, rechecked, described });
}
