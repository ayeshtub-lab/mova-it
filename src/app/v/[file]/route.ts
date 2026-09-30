import { viewUrl } from "@/server/media";
import { publicShot } from "@/server/seo";

// zawmo.com/v/ID.mp4: a public shot's video at an address that stays the same, for search
// engines. It forwards to the file's short-lived link (never cached: that link expires).
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = /^([a-z0-9]+)\.mp4$/.exec((await params).file)?.[1];
  const shot = id ? await publicShot(id) : null;
  const url = shot?.mediaType === "VIDEO" ? await viewUrl(shot.mediaPath) : null;
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } });
}
