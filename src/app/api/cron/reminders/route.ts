import { NextResponse } from "next/server";
import { remindStories } from "@/server/stories";

export const maxDuration = 120;

// Daily in the early evening (vercel.json): «مع الوقت» owners whose last shot is a week old
// are reminded to add one. Vercel's scheduler sends the secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stories = await remindStories();
  console.log("reminders", { stories });
  return NextResponse.json({ stories });
}
