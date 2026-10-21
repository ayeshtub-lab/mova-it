import { NextResponse } from "next/server";
import { brandPending } from "@/server/branded";
import { markPending } from "@/server/marked";
import { describePending, recheckUnscreened } from "@/server/angles";
import { stampWeather } from "@/server/weather";
import { translatePending } from "@/server/translate";
import { retitlePending } from "@/server/retitle";

// Until the English has been read and found good: show, don't keep. (Read 2026-10-21 — faithful to the
// Arabic, the place as the city, natural search words: kept from then on.)
const TRANSLATE_PREVIEW = false;
// Paused (his call, 2026-10-21) while the old titles lose their place (RETITLE): their English is
// written once, from the new titles, after.
const TRANSLATE_ON = false;
// The old titles rewritten without the place (src/server/retitle.ts) — shown first, kept once read.
const RETITLE_PREVIEW = true;

// Each render takes a while (the whole clip is re-encoded once).
export const maxDuration = 300;

// Every 10 minutes (vercel.json): fresh shots get the weather they were taken in (quick, a few
// calls), then older videos get their stamped copy made ahead, a few per run, and photos with a
// sound their shared video. A weather failure never stops the videos.
export async function GET(request: Request) {
  const started = Date.now();
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
  // Zawmo in English: public shots and moments still without their English words (src/server/translate.ts),
  // two small batches a run — text only, a fraction of a cent.
  // TRANSLATE_PREVIEW: the first runs only show what they would write (in the logs, «translate
  // preview»), so the English is read before any of it is kept.
  // Titles without the place first (25 a call, a second batch while there's time).
  let retitled = 0;
  for (let batch = 0; batch < 3; batch++) {
    const preview = RETITLE_PREVIEW ? { write: (line: string) => console.log("retitle preview", line) } : undefined;
    const n = await retitlePending(preview).catch((error) => (console.error("retitle failed", error), 0));
    if (RETITLE_PREVIEW) break;
    retitled += n;
    if (!n || Date.now() > started + 45_000) break;
  }
  let translated = 0;
  for (let batch = 0; TRANSLATE_ON && batch < 2; batch++) {
    const preview = TRANSLATE_PREVIEW ? { write: (line: string) => console.log("translate preview", line) } : undefined;
    const n = await translatePending(preview).catch((error) => (console.error("translate failed", error), 0));
    if (TRANSLATE_PREVIEW) break;
    translated += n;
    // (a second only while it leaves the branded copies their time)
    if (!n || Date.now() > started + 30_000) break;
  }
  // A new copy is started only within the first 90 s of the run, so it ends within the 300 s.
  const made = await brandPending(3, started + 90_000);
  const photos = await markPending(2);
  console.log("branded ahead", { made, photos, weather, rechecked, described, retitled, translated });
  return NextResponse.json({ made, photos, weather, rechecked, described, retitled, translated });
}
