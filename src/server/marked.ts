import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { parseCaption } from "@/lib/caption";
import { db } from "@/lib/db";
import { CANONICAL_HOST } from "@/lib/hosts";
import { wordsMark } from "@/lib/lyrics";
import { soundByKey } from "@/lib/sounds";
import { visibleAngle } from "@/server/access";
import { blobExists, viewUrl } from "@/server/media";
import { buildMarkedPhoto, buildMarkedPhotoVideo } from "@/server/montage/render";
import { publicShot } from "@/server/seo";

// «📤 شارك بختم زاومو» for photos: whoever can see a photo can send it on as a picture — to a
// WhatsApp status, an Instagram story — with the Zawmo mark, the moment's short link and who
// took it («بعدسة سلمى»). Like a TikTok download: every share carries the way back. The photo on
// Zawmo itself stays clean; only this copy is marked. Made once per version (look, writing,
// stamp, name, sound) and kept next to the shot. A photo with a sound goes out as a short video
// carrying it (a picture can't): TikTok and a status keep the sound.

const STYLE = "photo-mark-1";

export class MarkedError extends Error {
  constructor(public code: "not_found" | "not_photo") {
    super(code);
  }
}

const findShot = (angleId: string) =>
  db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { id: true, code: true, title: true } }, contributor: { select: { displayName: true } } } });
type Shot = NonNullable<Awaited<ReturnType<typeof findShot>>>;

const withSound = (angle: Shot) => !!soundByKey(angle.soundKey);

function markedPath(angle: Shot) {
  const sound = withSound(angle) ? [angle.soundKey, ...wordsMark(angle.soundKey, angle.lyrics)] : [];
  const version = createHash("sha256")
    .update(JSON.stringify([STYLE, angle.mediaPath, angle.filter, angle.stamp, parseCaption(angle.caption)?.path ?? null, angle.contributor.displayName, angle.moment.code, CANONICAL_HOST, ...sound]))
    .digest("hex")
    .slice(0, 16);
  return `m/${angle.moment.id}/${angle.id}-mark-${version}.${sound.length ? "mp4" : "jpg"}`;
}

// Makes the current version if it isn't there yet; returns its path (null: not a ready photo).
export async function ensureMarked(angleId: string) {
  const angle = await findShot(angleId);
  if (!angle || angle.status !== "READY" || angle.mediaType !== "PHOTO" || !angle.mediaPath) return null;
  const path = markedPath(angle);
  if (await blobExists(path)) return path;
  const dir = await mkdtemp(join(tmpdir(), "zawmo-photo-mark-"));
  try {
    const picture = await buildMarkedPhoto(
      {
        mediaPath: angle.mediaPath,
        filter: angle.filter,
        caption: angle.caption,
        stamp: angle.stamp,
        uploadedAt: angle.uploadedAt,
        momentCode: angle.moment.code,
        momentTitle: angle.moment.title,
        by: angle.contributor.displayName,
      },
      CANONICAL_HOST,
      dir,
    );
    const video = withSound(angle) ? await buildMarkedPhotoVideo(picture, angle.soundKey, angle.lyrics, CANONICAL_HOST, dir) : null;
    await put(path, await readFile(video ?? picture), { access: "private", contentType: video ? "video/mp4" : "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return path;
}

// The marked copy's link — for anyone who can see the photo (a visitor: public photos only).
export async function markedPhotoUrl(user: User | null, angleId: string) {
  const allowed = user ? await visibleAngle(user, angleId) : await publicShot(angleId);
  if (!allowed) throw new MarkedError("not_found");
  const angle = await findShot(angleId);
  if (!angle || angle.status !== "READY" || !angle.mediaPath) throw new MarkedError("not_found");
  if (angle.mediaType !== "PHOTO") throw new MarkedError("not_photo");
  const path = await ensureMarked(angleId);
  return path ? viewUrl(path) : null;
}

// Photos with a sound whose shared video isn't made yet (it takes a while, unlike a picture):
// made ahead by the cron, a few per run, so a share never waits.
export async function markPending(limit = 2) {
  const photos = await db.angle.findMany({
    where: { mediaType: "PHOTO", status: "READY", mediaPath: { not: null }, soundKey: { not: null } },
    orderBy: { uploadedAt: "desc" },
    take: 300,
    include: { moment: { select: { id: true, code: true, title: true } }, contributor: { select: { displayName: true } } },
  });
  let made = 0;
  for (const p of photos) {
    if (made >= limit) break;
    if (!withSound(p) || (await blobExists(markedPath(p)))) continue;
    await ensureMarked(p.id).catch((error) => console.error("marked ahead failed", p.id, error));
    made++;
  }
  return made;
}
