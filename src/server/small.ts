import { put } from "@vercel/blob";
import sharp from "sharp";
import { db } from "@/lib/db";
import { viewUrl } from "@/server/media";

// Grids and covers show a shot at a few hundred pixels; the phone does not need the
// full photo (up to 2048 px) for that. After a photo is uploaded, the server stores a
// small copy next to it. Videos already have a small poster (≤ 720 px) and need none.
const SHORT_EDGE = 540; // a grid cell on a phone at 3× pixel density
const QUALITY = 75;

export async function makeSmall(angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { id: true, mediaType: true, mediaPath: true, smallPath: true } });
  if (!angle || angle.mediaType !== "PHOTO" || !angle.mediaPath || angle.smallPath) return null;

  const url = await viewUrl(angle.mediaPath);
  const res = await fetch(url!, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const small = await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    // object-cover crops the long side, so the short side is what must stay sharp.
    .resize({ width: SHORT_EDGE, height: SHORT_EDGE, fit: "outside", withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();

  const path = angle.mediaPath.replace(/\.[^./]+$/, "") + "-small.jpg";
  await put(path, small, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
  await db.angle.update({ where: { id: angle.id }, data: { smallPath: path } });
  return { path, bytes: small.length };
}
