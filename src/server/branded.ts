import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseCaption } from "@/lib/caption";
import { blobExists, viewUrl } from "@/server/media";
import { buildBrandedShot } from "@/server/montage/render";

// «📤 شارك بختم زاومو»: the owner of a video shot gets it back with the Zawmo mark and closing
// card, to post anywhere — every share brings people to the moment. Made once per version of
// the shot (its look, writing, stamp) and kept next to it; nobody else can ask for it.

const STYLE = "mark-1";

export class BrandedError extends Error {
  constructor(public code: "not_found" | "not_video") {
    super(code);
  }
}

export async function brandedShotUrl(user: User, angleId: string, siteHost: string) {
  const angle = await db.angle.findUnique({
    where: { id: angleId },
    include: { moment: { select: { id: true, code: true, title: true } } },
  });
  if (!angle || angle.contributorId !== user.id || angle.status !== "READY" || !angle.mediaPath) throw new BrandedError("not_found");
  if (angle.mediaType !== "VIDEO") throw new BrandedError("not_video");

  const version = createHash("sha256")
    .update(JSON.stringify([STYLE, angle.mediaPath, angle.filter, angle.stamp, parseCaption(angle.caption)?.path ?? null, angle.moment.code, siteHost]))
    .digest("hex")
    .slice(0, 16);
  const path = `m/${angle.moment.id}/${angle.id}-zawmo-${version}.mp4`;

  if (!(await blobExists(path))) {
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
        },
        siteHost,
        dir,
      );
      await put(path, await readFile(file), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return viewUrl(path);
}
