import { NextResponse } from "next/server";
import { remindStories } from "@/server/stories";
import { remindDaily, SUMMARY_WEEKDAY, weeklySummary } from "@/server/nudges";

export const maxDuration = 120;

// Daily in the early evening (vercel.json): «مع الوقت» owners whose last shot is a week old
// are reminded to add one; members who haven't added to «لحظة اليوم» get a nudge; on Fridays,
// everyone with notifications gets their week's summary. Vercel's scheduler sends the secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stories = await remindStories();
  // «لحظة اليوم» for whoever hasn't added theirs; on Fridays (Mecca), the week's summary.
  const daily = await remindDaily().catch((error) => (console.error("daily reminder failed", error), -1));
  const friday = new Date(Date.now() + 3 * 3600e3).getUTCDay() === SUMMARY_WEEKDAY;
  const summaries = friday ? await weeklySummary().catch((error) => (console.error("weekly summary failed", error), -1)) : 0;
  console.log("reminders", { stories, daily, summaries });
  return NextResponse.json({ stories, daily, summaries });
}
