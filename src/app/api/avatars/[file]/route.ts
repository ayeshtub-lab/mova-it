import { NextResponse } from "next/server";
import { viewUrl } from "@/server/media";
import { AVATAR_FILE } from "@/server/profile";

// Profile photos live in the private Blob store; this hands out a short-lived link.
// A new photo gets a new file name, so the redirect may be cached for a few minutes.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!AVATAR_FILE.test(file)) return new NextResponse(null, { status: 404 });
  const url = await viewUrl(`avatars/${file}`);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=600" } });
}
