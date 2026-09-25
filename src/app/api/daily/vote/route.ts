import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { DailyError, tomorrowVote, vote } from "@/server/daily";

// Body: { theme: "coffee" } — a vote for tomorrow's «لحظة اليوم».
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  try {
    await vote(user, payload?.theme);
  } catch (error) {
    if (error instanceof DailyError) return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
  return NextResponse.json(await tomorrowVote(user));
}
