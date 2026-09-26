import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { recordActivity } from "@/server/stats";

// Sent once a day by the browser of a signed-in person (src/app/ActivityPing.tsx).
export async function POST() {
  const user = await getCurrentUser();
  if (user) await recordActivity(user);
  return new NextResponse(null, { status: 204 });
}
