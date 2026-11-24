import { NextResponse } from "next/server";
import { dailyCards } from "@/server/auto-cards";

// Each card: Gemini's lines for its picture, the drawing, the words' check (a few seconds each).
export const maxDuration = 300;

// «💌 بطاقات زاومو الجاهزة» (src/server/auto-cards.ts), every evening (vercel.json, 16:00 UTC = 19:00
// Mecca): English cards (up to 30 at first, then 2 a day), and on Thursdays the Friday cards (5 Arabic,
// 2 English). Vercel's scheduler sends the secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const made = await dailyCards().catch((error) => (console.error("daily cards failed", error), null));
  console.log("cards", made);
  return NextResponse.json({ made });
}
