import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { removePushDevice, savePushDevice } from "@/server/push";

// This device wants notifications. Body: { subscription (PushSubscription JSON), locale }.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const ok = await savePushDevice(user, body?.subscription, body?.locale);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "invalid" }, { status: 400 });
}

// This device doesn't any more. Body: { endpoint }.
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  await removePushDevice(user, body?.endpoint);
  return new NextResponse(null, { status: 204 });
}
