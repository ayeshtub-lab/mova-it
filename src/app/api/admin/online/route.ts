import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { onlineNow } from "@/server/presence";

// Live visitors for the dashboard (admins only; everyone else gets a 404).
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await onlineNow(), { headers: { "cache-control": "no-store" } });
}
