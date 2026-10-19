import { NextResponse } from "next/server";
import { remindStories } from "@/server/stories";
import { remindDaily, SUMMARY_WEEKDAY, weeklySummary } from "@/server/nudges";
import { sendWeatherAlerts } from "@/server/weather-alerts";
import { saveSearchTerms, seoWeekly } from "@/server/search-console";
import { sitemapList } from "@/server/sitemap-list";

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
  // Snow or real rain on the way (src/server/weather-alerts.ts): members there are told tonight.
  const weather = await sendWeatherAlerts().catch((error) => (console.error("weather alerts failed", error), -1));
  // Mondays: what people searched in Google to find Zawmo, the last 28 days (src/server/search-console.ts).
  const monday = new Date(Date.now() + 3 * 3600e3).getUTCDay() === 1;
  const searches = monday ? await saveSearchTerms().catch((error) => (console.error("search terms failed", error), -1)) : 0;
  // …and what Search Console says of the sitemap and of a sample of pages (src/server/search-console.ts).
  const seo = monday ? await seoSample().then(seoWeekly).then((r) => (r ? r.sample : "off"), (error) => (console.error("seo weekly failed", error), "failed")) : null;
  console.log("reminders", { stories, daily, summaries, weather, searches, seo });
  return NextResponse.json({ stories, daily, summaries, weather, searches, seo });
}

// The pages the weekly check inspects: the home page, then the newest moments, film parts, shots
// and a tag page of those at least a week old — by then Google should have them (a page of today
// not indexed yet is no news).
async function seoSample() {
  const weekAgo = Date.now() - 7 * 86400e3;
  const list = (await sitemapList())
    .filter((e) => !e.lastModified || new Date(e.lastModified).getTime() < weekAgo)
    .sort((a, b) => new Date(b.lastModified ?? 0).getTime() - new Date(a.lastModified ?? 0).getTime());
  const newest = (re: RegExp, n: number) => list.filter((e) => re.test(e.url)).slice(0, n).map((e) => e.url);
  return [
    ...newest(/^https:\/\/[^/]+\/?$/, 1),
    ...newest(/\/m\/[A-Z0-9]{6}$/, 3),
    ...newest(/\/film\/\d+$/, 2),
    ...newest(/\/m\/[A-Z0-9]{6}\/a\//, 2),
    ...newest(/\/tag\//, 1),
  ];
}
