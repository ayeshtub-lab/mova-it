import { viewUrl } from "@/server/media";
import { publicMontage, publicShot } from "@/server/seo";

// zawmo.com/v/ID.mp4: a public shot's video at an address that stays the same, for search
// engines — and zawmo.com/v/CODE.mp4 (a moment's code, upper case) its film. It forwards to the
// file's short-lived link (never cached: that link expires).
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = (await params).file;
  const code = /^([2-9A-HJKMNP-Z]{6})\.mp4$/.exec(file)?.[1];
  if (code) {
    const film = await publicMontage(code);
    const filmUrl = film ? await viewUrl(film.path) : null;
    if (!filmUrl) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 302, headers: { location: filmUrl, "cache-control": "private, no-store" } });
  }
  const id = /^([a-z0-9]+)\.mp4$/.exec(file)?.[1];
  const shot = id ? await publicShot(id) : null;
  const url = shot?.mediaType === "VIDEO" ? await viewUrl(shot.mediaPath) : null;
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } });
}
