import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { recordPresence } from "@/server/presence";

// "Still here" from an open page. Body: { key, path }.
// A crawler that says what it is is no visitor (the page itself already stays quiet for them).
const AUTOMATED = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|python|curl|wget|phantom|puppeteer|playwright|selenium/i;

export async function POST(request: Request) {
  if (AUTOMATED.test(request.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const body = await request.json().catch(() => null);
  const ok = await recordPresence(await getCurrentUser(), body?.key, body?.path);
  return new NextResponse(null, { status: ok ? 204 : 400 });
}
