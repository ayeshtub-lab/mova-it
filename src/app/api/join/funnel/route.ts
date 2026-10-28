import { NextResponse } from "next/server";
import { isJoinPlace, isJoinStep, recordJoinStep } from "@/server/join-funnel";

// A visitor's step toward joining (src/lib/funnel.ts joinStep): saw the join box, started, pressed
// to join — counted per page, for everyone. Nothing personal: only the step and the page.
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const step = params.get("step");
  const place = params.get("place");
  if (isJoinStep(step) && isJoinPlace(place)) {
    await recordJoinStep(place, step).catch((error) => console.error("join count failed", error));
  }
  return new NextResponse(null, { status: 204 });
}
