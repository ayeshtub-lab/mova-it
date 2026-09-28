import { NextResponse } from "next/server";
import { searchPlaces } from "@/server/places";

// Place suggestions while typing («بيتل» → بيت لحم…). Public data, the same for everyone.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 60) ?? "";
  const places = await searchPlaces(q, 6);
  return NextResponse.json({ places }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
