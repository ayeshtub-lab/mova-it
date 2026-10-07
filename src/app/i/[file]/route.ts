import { viewUrl } from "@/server/media";
import { publicShot } from "@/server/seo";

// zawmo.com/i/ID.jpg: a public shot's picture (a video's poster) at an address that stays
// the same, for search engines and link previews; ID-small.jpg its small copy, for the grids of
// public pages (src/server/media.ts publicCover). Anything not public is "not found".
// Cached for an hour only, so a shot made private or deleted leaves the cache soon after.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const [, id, small] = /^([a-z0-9]+)(-small)?\.jpg$/.exec((await params).file) ?? [];
  const shot = id ? await publicShot(id) : null;
  const full = shot && (shot.mediaType === "PHOTO" ? shot.mediaPath : shot.thumbPath);
  const path = small ? (shot?.smallPath ?? full) : full;
  const url = path ? await viewUrl(path) : null;
  if (!url) return new Response("Not found", { status: 404 });

  const file = await fetch(url).catch(() => null);
  if (!file?.ok || !file.body) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "content-type": file.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
