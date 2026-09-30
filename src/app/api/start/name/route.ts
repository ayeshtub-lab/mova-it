import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setDisplayName } from "@/server/profile";

// After the first shot on the ad landing: «شو اسمك؟» — optional; skipping keeps «ضيف ٤٢١٧».
// Body: { name }.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    await setDisplayName(user, body?.name);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
