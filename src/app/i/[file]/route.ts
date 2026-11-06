import { publicCard, saveSmallCard, smallCardPath } from "@/server/cards";
import { viewUrl } from "@/server/media";
import { publicPart } from "@/server/montage/parts";
import { partCoverPath } from "@/server/montage/render";
import { publicShot } from "@/server/seo";

// zawmo.com/i/ID.jpg: a public shot's picture (a video's poster) at an address that stays
// the same, for search engines and link previews; ID-small.jpg its small copy, for the grids of
// public pages (src/server/media.ts publicCover). Anything not public is "not found".
// Kept by the CDN six hours (an hour until 2026-11-03: these pictures were the biggest CPU use —
// his choice, «6 ساعات بلا مسح»), by browsers an hour: a shot made private or deleted leaves the
// cache within six hours at most.
// zawmo.com/i/CODE-N.jpg (2026-10-23): a film part's own cover, a frame from its middle — until the
// part is made again with one, its first shot's picture.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const name = (await params).file;
  // zawmo.com/i/card-ID.jpg: a public «💌 بطاقة» (src/server/cards.ts); card-ID-small.jpg its small
  // copy for grids — made here on the first visit for a card saved before there were small copies.
  // The small copy is kept out of Google Images (2026-11-06, his OK «الخطوتين مع بعض»): it showed
  // under /cards with the one gallery title for every card (425 impressions, 0 clicks, the same card
  // twice); the full picture stays, on the card's own page with its own words as the title.
  const cardOf = /^card-([a-z0-9]{20,40})(-small)?\.jpg$/.exec(name);
  if (cardOf) {
    const card = await publicCard(cardOf[1]);
    if (!card?.imagePath) return new Response("Not found", { status: 404 });
    if (cardOf[2]) {
      const small = await fetch((await viewUrl(smallCardPath(card.imagePath)))!).catch(() => null);
      if (small?.ok && small.body) return image(small, true);
    }
    const file = await fetch((await viewUrl(card.imagePath))!).catch(() => null);
    if (!file?.ok || !file.body) return new Response("Not found", { status: 404 });
    if (!cardOf[2]) return image(file);
    const full = Buffer.from(await file.arrayBuffer());
    const made = await saveSmallCard(card.imagePath, full).catch(() => null);
    return image(new Response(new Uint8Array(made ?? full), { headers: { "content-type": "image/jpeg" } }), true);
  }
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

function image(file: Response, notInSearch = false) {
  return new Response(file.body, {
    headers: {
      "content-type": file.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=3600, s-maxage=21600",
      "x-content-type-options": "nosniff",
      ...(notInSearch ? { "x-robots-tag": "noindex" } : {}),
    },
  });
}
