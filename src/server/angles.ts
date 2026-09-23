import { MediaType, Presence } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { blobExists } from "@/server/media";

export const MAX_VIDEO_SECONDS = 20;
// A little slack: containers round durations, and a 20.3 s clip is still "20 seconds".
const VIDEO_SECONDS_TOLERANCE = 0.5;
const ANGLES_PER_USER_PER_MOMENT = 30;
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const ANGLE_LIFETIME_MS = 24 * 60 * 60 * 1000;

const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

export class AngleError extends Error {
  constructor(
    public code: "not_found" | "invalid_media" | "too_long" | "too_many" | "not_uploaded" | "forbidden",
  ) {
    super(code);
  }
}

export type PrepareAngleInput = {
  code: unknown;
  mediaType: unknown;
  contentType?: unknown;
  capturedAt?: unknown;
  durationSec?: unknown;
  width?: unknown;
  height?: unknown;
  presence?: unknown;
};

const positiveInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 20000 ? v : null);

// Capture time comes from the device (EXIF or file date). Reject nonsense, keep the rest.
function captureDate(v: unknown) {
  if (typeof v !== "string") return null;
  const date = new Date(v);
  const t = date.getTime();
  if (Number.isNaN(t) || t > Date.now() + 5 * 60 * 1000 || t < Date.UTC(2000, 0, 1)) return null;
  return date;
}

// Step 1: reserve an angle and the exact Blob paths this user may upload to.
export async function prepareAngle(user: User, input: PrepareAngleInput) {
  const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
  const moment = await db.moment.findUnique({ where: { code } });
  if (!moment || moment.status === "HIDDEN") throw new AngleError("not_found");

  const mediaType = input.mediaType === "VIDEO" ? MediaType.VIDEO : input.mediaType === "PHOTO" ? MediaType.PHOTO : null;
  if (!mediaType) throw new AngleError("invalid_media");

  let ext = "jpg";
  let durationSec: number | null = null;
  if (mediaType === MediaType.VIDEO) {
    ext = VIDEO_TYPES[String(input.contentType)] ?? "";
    if (!ext) throw new AngleError("invalid_media");
    if (typeof input.durationSec !== "number" || !(input.durationSec > 0)) throw new AngleError("invalid_media");
    if (input.durationSec > MAX_VIDEO_SECONDS + VIDEO_SECONDS_TOLERANCE) throw new AngleError("too_long");
    durationSec = Math.round(input.durationSec * 10) / 10;
  }

  const existing = await db.angle.count({
    where: { momentId: moment.id, contributorId: user.id, status: { not: "REMOVED" } },
  });
  if (existing >= ANGLES_PER_USER_PER_MOMENT) throw new AngleError("too_many");

  const angle = await db.angle.create({
    data: {
      momentId: moment.id,
      contributorId: user.id,
      mediaType,
      presence: input.presence === "REMOTE" ? Presence.REMOTE : Presence.THERE,
      durationSec,
      width: positiveInt(input.width),
      height: positiveInt(input.height),
      capturedAt: captureDate(input.capturedAt),
    },
  });

  const base = `m/${moment.id}/${angle.id}`;
  const paths = {
    mediaPath: `${base}.${ext}`,
    thumbPath: mediaType === MediaType.VIDEO ? `${base}-poster.jpg` : null,
  };
  await db.angle.update({ where: { id: angle.id }, data: paths });

  // Contributing makes you a contributor (a host stays a host).
  await db.participant.upsert({
    where: { momentId_userId: { momentId: moment.id, userId: user.id } },
    create: { momentId: moment.id, userId: user.id, role: "CONTRIBUTOR" },
    update: {},
  });
  await db.participant.updateMany({
    where: { momentId: moment.id, userId: user.id, role: "VIEWER" },
    data: { role: "CONTRIBUTOR" },
  });

  return { angleId: angle.id, ...paths };
}

// Step 2 (token request): only the owner of a still-processing angle, only its own
// paths, only matching types and sizes, and only shortly after preparing it.
export async function uploadConstraintsFor(user: User, pathname: string) {
  const angle = await db.angle.findFirst({
    where: { OR: [{ mediaPath: pathname }, { thumbPath: pathname }] },
  });
  if (!angle || angle.contributorId !== user.id || angle.status !== "PROCESSING") throw new AngleError("forbidden");
  if (Date.now() - angle.uploadedAt.getTime() > UPLOAD_WINDOW_MS) throw new AngleError("forbidden");

  if (pathname === angle.thumbPath) return { angleId: angle.id, allowedContentTypes: ["image/jpeg"], maximumSizeInBytes: 2 * 1024 * 1024 };
  if (angle.mediaType === MediaType.PHOTO) {
    return { angleId: angle.id, allowedContentTypes: ["image/jpeg"], maximumSizeInBytes: 12 * 1024 * 1024 };
  }
  return { angleId: angle.id, allowedContentTypes: Object.keys(VIDEO_TYPES), maximumSizeInBytes: 150 * 1024 * 1024 };
}

// Step 3: the device reports the upload finished; trust it only after the files exist.
export async function completeAngle(user: User, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  if (!angle || angle.contributorId !== user.id) throw new AngleError("not_found");
  if (angle.status === "READY") return angle;
  if (angle.status !== "PROCESSING") throw new AngleError("forbidden");

  const needed = [angle.mediaPath, angle.thumbPath].filter((p): p is string => !!p);
  const present = await Promise.all(needed.map(blobExists));
  if (present.includes(false)) throw new AngleError("not_uploaded");

  const now = new Date();
  const [ready] = await db.$transaction([
    db.angle.update({
      where: { id: angle.id },
      data: {
        status: "READY",
        expiresAt: angle.moment.isPermanent ? null : new Date(now.getTime() + ANGLE_LIFETIME_MS),
      },
    }),
    db.moment.update({ where: { id: angle.momentId }, data: { lastActivityAt: now } }),
  ]);
  return ready;
}
