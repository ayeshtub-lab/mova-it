import { NextResponse } from "next/server";
import { placeViews, searchPlaces } from "@/server/places";

// Place suggestions while typing («بيتل» → بيت لحم…), or one place by id (?id=ps-452300, for
// «📍 مكاني», which finds the id on the phone). Public data, the same for everyone.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cache = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };
  const id = params.get("id")?.slice(0, 40);
  if (id) {
    const place = (await placeViews([id])).get(id);
    return NextResponse.json({ places: place ? [place] : [] }, { headers: cache });
  }
  const places = await searchPlaces(params.get("q")?.slice(0, 60) ?? "", 6);
  return NextResponse.json({ places }, { headers: cache });
}
