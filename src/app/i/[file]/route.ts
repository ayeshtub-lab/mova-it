import { viewUrl } from "@/server/media";
import { publicPart } from "@/server/montage/parts";
import { partCoverPath } from "@/server/montage/render";
import { publicShot } from "@/server/seo";

// zawmo.com/i/ID.jpg: a public shot's picture (a video's poster) at an address that stays
// the same, for search engines and link previews; ID-small.jpg its small copy, for the grids of
// public pages (src/server/media.ts publicCover). Anything not public is "not found".
// Cached for an hour only, so a shot made private or deleted leaves the cache soon after.
// zawmo.com/i/CODE-N.jpg (2026-10-23): a film part's own cover, a frame from its middle — until the
// part is made again with one, its first shot's picture.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = (await params).file;
  const partOf = /^([2-9A-HJKMNP-Z]{6})-(\d{1,3})\.jpg$/.exec(name);
  if (partOf) {
    const part = await publicPart(partOf[1], Number(partOf[2]));
    if (!part) return new Response("Not found", { status: 404 });
    const cover = await viewUrl(partCoverPath(part.path));
    const own = cover ? await fetch(cover).catch(() => null) : null;
    if (own?.ok && own.body) return image(own);
    return part.poster ? GET(_request, { params: Promise.resolve({ file: `${part.poster}.jpg` }) }) : new Response("Not found", { status: 404 });
  }
  const [, id, small] = /^([a-z0-9]+)(-small)?\.jpg$/.exec(name) ?? [];
  const shot = id ? await publicShot(id) : null;
  const full = shot && (shot.mediaType === "PHOTO" ? shot.mediaPath : shot.thumbPath);
  const path = small ? (shot?.smallPath ?? full) : full;
  const url = path ? await viewUrl(path) : null;
  if (!url) return new Response("Not found", { status: 404 });

  const file = await fetch(url).catch(() => null);
  if (!file?.ok || !file.body) return new Response("Not found", { status: 404 });
  return image(file);
}

function image(file: Response) {
  return new Response(file.body, {
    headers: {
      "content-type": file.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
