import sharp from "sharp";
import { db } from "@/lib/db";
import { MID, dhashFrom32 } from "@/lib/dhash";
import { viewUrl } from "@/server/media";

// The fingerprint (src/lib/dhash.ts) of shots that went up before phones sent one (2026-11-10): from
// the small copy of a photo or a video's poster, the same way the phone makes it — down to 32×32,
// then 9×8 in grey. A few per run of the hourly cleanup, newest first, until none is left.
export async function dhashOfImage(bytes: Buffer) {
  const rgb = await sharp(bytes).rotate().resize(MID, MID, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const grey: number[] = [];
  for (let i = 0; i < rgb.length; i += 3) grey.push(0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]);
  return dhashFrom32(grey);
}

export async function backfillDhash(limit = 40) {
  const shots = await db.angle.findMany({
    where: { dhash: null, status: { in: ["READY", "DRAFT", "HIDDEN"] }, OR: [{ smallPath: { not: null } }, { thumbPath: { not: null } }, { mediaType: "PHOTO", mediaPath: { not: null } }] },
    select: { id: true, mediaType: true, mediaPath: true, smallPath: true, thumbPath: true },
    orderBy: { uploadedAt: "desc" },
    take: limit,
  });
  let done = 0;
  for (const s of shots) {
    const path = s.mediaType === "PHOTO" ? (s.smallPath ?? s.mediaPath) : s.thumbPath;
    try {
      const url = path ? await viewUrl(path) : null;
      const res = url ? await fetch(url, { signal: AbortSignal.timeout(15_000) }) : null;
      // One that can't be read is marked so it isn't tried every hour («-» never matches a fingerprint).
      const dhash = res?.ok ? await dhashOfImage(Buffer.from(await res.arrayBuffer())) : "-";
      await db.angle.update({ where: { id: s.id }, data: { dhash } });
      done++;
    } catch (error) {
      console.error("dhash backfill failed", s.id, error);
      await db.angle.update({ where: { id: s.id }, data: { dhash: "-" } }).catch(() => {});
    }
  }
  return done;
}
