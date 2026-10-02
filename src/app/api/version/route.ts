import { NextResponse } from "next/server";

// The version now live (the deployed commit): open pages compare it with their own and load
// the newer one (src/app/FreshVersion.tsx).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "cache-control": "no-store" } });
}
