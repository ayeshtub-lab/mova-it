import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SOURCE_COOKIE } from "@/lib/source";
import { CARD_STEPS, recordCardStep, type CardStep } from "@/server/card-funnel";

// A step with the cards (src/lib/funnel.ts cardStep): counted against where this visitor first came
// from (the source cookie set by src/proxy.ts), «direct» without one. Nothing personal.
export async function POST(request: Request) {
  const source = (await cookies()).get(SOURCE_COOKIE)?.value?.slice(0, 40) || "direct";
  const step = new URL(request.url).searchParams.get("step");
  if (step && step in CARD_STEPS) {
    await recordCardStep(source, step as CardStep).catch((error) => console.error("card count failed", error));
  }
  return new NextResponse(null, { status: 204 });
}
