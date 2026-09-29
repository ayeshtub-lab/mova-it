import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SOURCE_COOKIE } from "@/lib/source";
import { FUNNEL_STEPS, recordFunnel, type FunnelStep } from "@/server/stats";

// A visitor from an ad started typing their name, or pressed «ابدأ» (src/app/GuestForm.tsx):
// counted against their campaign (the source cookie set by src/proxy.ts). Nothing personal.
export async function POST(request: Request) {
  const source = (await cookies()).get(SOURCE_COOKIE)?.value?.slice(0, 40);
  const step = new URL(request.url).searchParams.get("step");
  if (source && FUNNEL_STEPS.includes(step as FunnelStep)) {
    await recordFunnel(source, step as FunnelStep).catch((error) => console.error("funnel count failed", error));
  }
  return new NextResponse(null, { status: 204 });
}
