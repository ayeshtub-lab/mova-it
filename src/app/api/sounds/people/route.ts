import { NextResponse } from "next/server";
import { peopleSounds } from "@/server/user-sounds";

// «🎤 من الناس» in the sound picker.
export async function GET() {
  return NextResponse.json(await peopleSounds(), { headers: { "cache-control": "public, max-age=60" } });
}
