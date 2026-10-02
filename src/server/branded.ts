import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseCaption } from "@/lib/caption";
import { CANONICAL_HOST } from "@/lib/hosts";
import { blobExists, viewUrl } from "@/server/media";
import { buildBrandedShot } from "@/server/montage/render";

// «شارك بختم زاومو»: a video shot with the Zawmo mark, its sound and the closing card — what is
// sent whenever its owner shares it. Made AHEAD (after publishing, after any change, and by the
// cron for older videos), so a share never waits; one file per version (look, writing, stamp,
// sound), kept next to the shot.

const STYLE = "mark-2";

export class BrandedError extends Error {
  constructor(public code: "not_found" | "not_video") {
    super(code);
  }
}

type Shot = NonNullable<Awaited<ReturnType<typeof findShot>>>;
const findShot = (angleId: string) => db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { id: true, code: true, title: true } } } });

function brandedPath(angle: Shot) {
  const version = createHash("sha256")
    .update(JSON.stringify([STYLE, angle.mediaPath, angle.filter, angle.stamp, parseCaption(angle.caption)?.path ?? null, angle.soundKey, angle.muteOriginal, angle.moment.code, CANONICAL_HOST]))
    .digest("hex")
    .slice(0, 16);
  return `m/${angle.moment.id}/${angle.id}-zawmo-${version}.mp4`;
}

// Makes the current version if it isn't there yet; returns its path (null: not a ready video).
export async function ensureBranded(angleId: string) {
  const angle = await findShot(angleId);
  if (!angle || angle.status !== "READY" || angle.mediaType !== "VIDEO" || !angle.mediaPath) return null;
  const path = brandedPath(angle);
  if (await blobExists(path)) return path;
  const dir = await mkdtemp(join(tmpdir(), "zawmo-mark-"));
  try {
    const file = await buildBrandedShot(
      {
        mediaPath: angle.mediaPath,
        filter: angle.filter,
        caption: angle.caption,
        stamp: angle.stamp,
        uploadedAt: angle.uploadedAt,
        momentCode: angle.moment.code,
        momentTitle: angle.moment.title,
        soundKey: angle.soundKey,
        muteOriginal: angle.muteOriginal,
      },
      CANONICAL_HOST,
      dir,
    );
    await put(path, await readFile(file), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return path;
}

// The owner asks for it (to share): usually ready already.
export async function brandedShotUrl(user: User, angleId: string) {
  const angle = await findShot(angleId);
  if (!angle || angle.contributorId !== user.id || angle.status !== "READY" || !angle.mediaPath) throw new BrandedError("not_found");
  if (angle.mediaType !== "VIDEO") throw new BrandedError("not_video");
  const path = await ensureBranded(angleId);
  return path ? viewUrl(path) : null;
}

// After any change to a video (published, new look, writing, sound): make its new version
// now, in the background. Never throws.
export async function brandAfterChange(angleId: string) {
  await ensureBranded(angleId).catch((error) => console.error("branded ahead failed", angleId, error));
}

// The cron: older videos without their current stamped copy, a few per run.
export async function brandPending(limit = 3) {
  const videos = await db.angle.findMany({
    where: { mediaType: "VIDEO", status: "READY", mediaPath: { not: null } },
    orderBy: { uploadedAt: "desc" },
    take: 300,
    include: { moment: { select: { id: true, code: true, title: true } } },
  });
  let made = 0;
  for (const v of videos) {
    if (made >= limit) break;
    if (await blobExists(brandedPath(v))) continue;
    await brandAfterChange(v.id);
    made++;
  }
  return made;
}
