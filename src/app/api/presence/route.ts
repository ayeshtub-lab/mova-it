import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { recordPresence } from "@/server/presence";

// "Still here" from an open page. Body: { key, path }.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const ok = await recordPresence(await getCurrentUser(), body?.key, body?.path);
  return new NextResponse(null, { status: ok ? 204 : 400 });
}
