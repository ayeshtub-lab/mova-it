import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { parseCaption } from "@/lib/caption";
import { db } from "@/lib/db";
import { CANONICAL_HOST } from "@/lib/hosts";
import { visibleAngle } from "@/server/access";
import { blobExists, viewUrl } from "@/server/media";
import { buildMarkedPhoto } from "@/server/montage/render";
import { publicShot } from "@/server/seo";

// «📤 شارك بختم زاومو» for photos: whoever can see a photo can send it on as a picture — to a
// WhatsApp status, an Instagram story — with the Zawmo mark, the moment's short link and who
// took it («بعدسة سلمى»). Like a TikTok download: every share carries the way back. The photo on
// Zawmo itself stays clean; only this copy is marked. Made once per version (look, writing,
// stamp, name) and kept next to the shot.

const STYLE = "photo-mark-1";

export class MarkedError extends Error {
  constructor(public code: "not_found" | "not_photo") {
    super(code);
  }
}

const findShot = (angleId: string) =>
  db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { id: true, code: true, title: true } }, contributor: { select: { displayName: true } } } });
type Shot = NonNullable<Awaited<ReturnType<typeof findShot>>>;

function markedPath(angle: Shot) {
  const version = createHash("sha256")
    .update(JSON.stringify([STYLE, angle.mediaPath, angle.filter, angle.stamp, parseCaption(angle.caption)?.path ?? null, angle.contributor.displayName, angle.moment.code, CANONICAL_HOST]))
    .digest("hex")
    .slice(0, 16);
  return `m/${angle.moment.id}/${angle.id}-mark-${version}.jpg`;
}

// The marked picture's link — for anyone who can see the photo (a visitor: public photos only).
export async function markedPhotoUrl(user: User | null, angleId: string) {
  const allowed = user ? await visibleAngle(user, angleId) : await publicShot(angleId);
  if (!allowed) throw new MarkedError("not_found");
  const angle = await findShot(angleId);
  if (!angle || angle.status !== "READY" || !angle.mediaPath) throw new MarkedError("not_found");
  if (angle.mediaType !== "PHOTO") throw new MarkedError("not_photo");
  const path = markedPath(angle);
  if (!(await blobExists(path))) {
    const dir = await mkdtemp(join(tmpdir(), "zawmo-photo-mark-"));
    try {
      const file = await buildMarkedPhoto(
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
      await put(path, await readFile(file), { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return viewUrl(path);
}
