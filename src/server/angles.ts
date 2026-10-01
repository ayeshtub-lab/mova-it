import { del, list } from "@vercel/blob";
import { MediaType, PlaceSource, Presence } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseCaption } from "@/lib/caption";
import { blobExists, viewUrl } from "@/server/media";
import { probeDuration } from "@/server/ffmpeg";
import { screenAngle, screeningEnabled, screenText } from "@/server/screening";
import { deleteFromStream } from "@/server/stream";

export const MAX_VIDEO_SECONDS = 40;
// A little slack: containers round durations, and a 40.3 s clip is still "40 seconds".
const VIDEO_SECONDS_TOLERANCE = 0.5;
const ANGLES_PER_USER_PER_MOMENT = 30;
// «مع الوقت»: a shot a day for most of a year.
const SHOTS_PER_STORY = 300;
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

export class AngleError extends Error {
  constructor(
    public code: "not_found" | "invalid_media" | "too_long" | "too_many" | "not_uploaded" | "forbidden" | "official_required" | "needs_title" | "story_owner",
  ) {
    super(code);
  }
}

export type PrepareAngleInput = {
  code: unknown;
  mediaType: unknown;
  contentType?: unknown;
  capturedAt?: unknown;
  placeId?: unknown; // worked out on the phone from the photo's own location
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

// A photo taken within this long before upload counts as «موثّق» when its place came from it.
const VERIFIED_WITHIN_MS = 3 * 24 * 60 * 60 * 1000;

// Where the shot was taken: the photo's own place (sent by the phone), else the moment's.
// ipCountry is the uploader's network country (a request header); only the match is kept.
async function placeFor(input: PrepareAngleInput, momentPlaceId: string | null, capturedAt: Date | null, ipCountry: string | null) {
  const fromPhoto =
    typeof input.placeId === "string" && input.placeId.length <= 40
      ? await db.place.findUnique({ where: { id: input.placeId }, select: { id: true, countryCode: true, kind: true } })
      : null;
  if (fromPhoto && fromPhoto.kind !== "COUNTRY" && fromPhoto.kind !== "GOVERNORATE") {
    return {
      placeId: fromPhoto.id,
      placeFrom: PlaceSource.PHOTO,
      placeVerified: !!capturedAt && Date.now() - capturedAt.getTime() <= VERIFIED_WITHIN_MS,
      ipCountryMatch: ipCountry ? ipCountry.toUpperCase() === fromPhoto.countryCode : null,
    };
  }
  if (momentPlaceId) return { placeId: momentPlaceId, placeFrom: PlaceSource.MOMENT, placeVerified: false, ipCountryMatch: null };
  return {};
}

// Step 1: reserve an angle and the exact Blob paths this user may upload to.
// networkPlaceId: the town the connection comes from (src/server/network-place.ts) — kept
// only for «صوّر معك» matching, never shown.
export async function prepareAngle(user: User, input: PrepareAngleInput, ipCountry: string | null = null, networkPlaceId: string | null = null) {
  const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
  const moment = await db.moment.findUnique({ where: { code } });
  if (!moment || moment.status === "HIDDEN") throw new AngleError("not_found");
  // Anything added to a public moment is public: only official (Google) accounts.
  if (moment.visibility === "PUBLIC" && user.isGuest) throw new AngleError("official_required");
  // A «مع الوقت» story is shot by its owner alone.
  if (moment.kind === "STORY" && moment.creatorId !== user.id) throw new AngleError("story_owner");

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
  if (existing >= (moment.kind === "STORY" ? SHOTS_PER_STORY : ANGLES_PER_USER_PER_MOMENT)) throw new AngleError("too_many");

  const capturedAt = captureDate(input.capturedAt);
  const place = await placeFor(input, moment.placeId, capturedAt, ipCountry);
  const angle = await db.angle.create({
    data: {
      momentId: moment.id,
      contributorId: user.id,
      mediaType,
      presence: input.presence === "REMOTE" ? Presence.REMOTE : Presence.THERE,
      durationSec,
      width: positiveInt(input.width),
      height: positiveInt(input.height),
      capturedAt,
      ...place,
      networkPlaceId,
      // «✨ تحسين» from the start: every new shot looks its best; «طبيعي» takes it back.
      filter: "auto",
    },
  });
  // A moment without a place takes the first one a photo brings (silently, like the shot's).
  if (!moment.placeId && place.placeFrom === PlaceSource.PHOTO) {
    await db.moment.updateMany({ where: { id: moment.id, placeId: null }, data: { placeId: place.placeId } });
  }

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
  // 40 s of 4K from a phone can pass 250 MB.
  return { angleId: angle.id, allowedContentTypes: Object.keys(VIDEO_TYPES), maximumSizeInBytes: 300 * 1024 * 1024 };
}

// Deletes an angle for good: its files, its reactions, and every montage it appears in
// (so deleted footage does not live on inside an old montage). Allowed for the person
// who added it and for the moment's creator, who moderates their moment.
export async function deleteAngle(user: User, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  if (!angle || (angle.contributorId !== user.id && angle.moment.creatorId !== user.id)) throw new AngleError("not_found");

  const montages = await db.montage.findMany({ where: { momentId: angle.momentId, angleIds: { has: angle.id } } });
  const files = [angle.mediaPath, angle.thumbPath, angle.smallPath, parseCaption(angle.caption)?.path, ...montages.map((m) => m.videoUrl)].filter((p): p is string => !!p);

  await db.$transaction([
    db.montage.deleteMany({ where: { id: { in: montages.map((m) => m.id) } } }),
    db.angle.delete({ where: { id: angle.id } }),
  ]);
  // After the rows are gone, so a failed storage call can never leave a visible angle without its file.
  if (files.length) await del(files).catch((error) => console.error("deleteAngle: blob cleanup failed", angle.id, error));
  await deleteFromStream(angle.streamUid);
}

// «احذف اللحظة كاملة»: its creator removes the moment with every shot (by everyone), its videos
// and every file kept for it. Never «لحظة اليوم» (it belongs to everyone). The rows go first
// (everything hanging on the moment goes with it), then the files.
export async function deleteMoment(user: User, code: string) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment || moment.creatorId !== user.id || moment.kind === "DAILY") throw new AngleError("not_found");
  const [angles, montages] = await Promise.all([
    db.angle.findMany({ where: { momentId: moment.id }, select: { mediaPath: true, thumbPath: true, smallPath: true, caption: true, streamUid: true } }),
    db.montage.findMany({ where: { momentId: moment.id }, select: { videoUrl: true } }),
  ]);
  const files = [...angles.flatMap((a) => [a.mediaPath, a.thumbPath, a.smallPath, parseCaption(a.caption)?.path]), ...montages.map((m) => m.videoUrl)].filter((p): p is string => !!p);
  await db.moment.delete({ where: { id: moment.id } });
  // Also whatever else was made under the moment's folder («🆕 الجديد», the daily film…).
  const folder = await list({ prefix: `m/${moment.id}/` }).then((r) => r.blobs.map((b) => b.pathname)).catch(() => []);
  const all = [...new Set([...files, ...folder])];
  if (all.length) await del(all).catch((error) => console.error("deleteMoment: blob cleanup failed", moment.id, error));
  for (const a of angles) await deleteFromStream(a.streamUid);
  return { deleted: angles.length };
}

// «احذف لقطاتي من هاللحظة»: someone removes every shot of theirs from a moment at once.
export async function deleteMyShots(user: User, code: string) {
  const mine = await db.angle.findMany({ where: { moment: { code: code.toUpperCase() }, contributorId: user.id }, select: { id: true } });
  for (const a of mine) await deleteAngle(user, a.id);
  return { deleted: mine.length };
}

// Step 3: the device reports the upload finished; trust it only after the files exist.
export async function completeAngle(user: User, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  if (!angle || angle.contributorId !== user.id) throw new AngleError("not_found");
  // Already done (a retry): report what happened the first time.
  if (angle.status === "DRAFT" || angle.status === "READY" || (angle.status === "HIDDEN" && angle.screening === "blocked")) return Object.assign(angle, { titleSuggestion: null as string | null });
  if (angle.status !== "PROCESSING") throw new AngleError("forbidden");

  const needed = [angle.mediaPath, angle.thumbPath].filter((p): p is string => !!p);
  const present = await Promise.all(needed.map(blobExists));
  if (present.includes(false)) throw new AngleError("not_uploaded");

  // The phone said how long the video is; the server measures it itself (a tampered upload
  // can't slip a 10-minute video past the 40-second limit). Too long → gone, files and all.
  if (angle.mediaType === MediaType.VIDEO && angle.mediaPath) {
    const measured = await probeDuration((await viewUrl(angle.mediaPath))!);
    if (measured != null && measured > MAX_VIDEO_SECONDS + VIDEO_SECONDS_TOLERANCE) {
      await db.angle.delete({ where: { id: angle.id } });
      await del(needed).catch((error) => console.error("too long: blob cleanup failed", angle.id, error));
      throw new AngleError("too_long");
    }
    if (measured == null) console.error("could not measure video length", angle.id);
    else angle.durationSec = Math.round(measured * 10) / 10;
  }

  // Automatic check before anyone sees it. Blocked → hidden and queued for the admins.
  // If the check itself fails: friends/link moments still go up (and it's logged), but
  // in a public moment the angle waits for an admin — public content is always checked.
  const verdict = screeningEnabled() ? await screenAngle(angle) : null;
  if (verdict?.result === "error") console.error("screening failed", angle.id, verdict.reason);
  const isPublic = angle.moment.visibility === "PUBLIC";
  const blocked = verdict?.result === "blocked" || (isPublic && verdict?.result !== "allowed");

  const now = new Date();
  // The lens's name for the shot, offered when the moment was started without one.
  const titleSuggestion = verdict?.result === "allowed" ? (verdict.title ?? null) : null;
  const saved = await db.$transaction(async (tx) => {
    const done = await tx.angle.update({
      where: { id: angle.id },
      data: {
        // Fine → a draft only its owner sees, until they press «نشر» (after «صوّر معك» looked).
        status: blocked ? "HIDDEN" : "DRAFT",
        expiresAt: null, // shots are kept until their owner deletes them
        screening: verdict?.result ?? null,
        durationSec: angle.durationSec,
        scene: verdict?.result === "allowed" ? (verdict.scene ?? null) : null,
        seenText: verdict?.result === "allowed" ? (verdict.seen ?? null) : null,
        aiText: verdict?.result === "allowed" ? (verdict.text ?? null) : null,
        screenedAt: verdict ? now : null,
      },
    });
    if (blocked) {
      const note = verdict?.result === "blocked" ? `${verdict.category}: ${verdict.reason}` : `public, not checked: ${verdict?.result === "error" ? verdict.reason : "screening off"}`;
      await tx.report.create({ data: { momentId: angle.momentId, angleId: angle.id, reason: "AI", note: note.slice(0, 500) } });
    }
    return done;
  });
  return Object.assign(saved, { titleSuggestion });
}

// A moment just became public: angles added before (unchecked, or checked while the
// check was failing) are checked now. (Explicit null: in SQL, NULL <> "allowed" is not true.) Anything not clearly fine is hidden for an admin.
export async function screenForPublic(momentId: string) {
  // The description too: one that does not pass is removed rather than shown to everyone.
  const moment = await db.moment.findUnique({ where: { id: momentId }, select: { description: true } });
  if (moment?.description && (await screenText(moment.description)).result !== "allowed") {
    await db.moment.update({ where: { id: momentId }, data: { description: null } });
  }
  const angles = await db.angle.findMany({ where: { momentId, status: "READY", OR: [{ screening: null }, { screening: { not: "allowed" } }] } });
  for (const angle of angles) {
    const verdict = screeningEnabled() ? await screenAngle(angle) : null;
    const now = new Date();
    if (verdict?.result === "allowed") {
      await db.angle.update({ where: { id: angle.id }, data: { screening: "allowed", screenedAt: now, scene: verdict.scene ?? null, seenText: verdict.seen ?? null, aiText: verdict.text ?? null } });
      continue;
    }
    const note = verdict?.result === "blocked" ? `${verdict.category}: ${verdict.reason}` : `public, not checked: ${verdict?.result === "error" ? verdict.reason : "screening off"}`;
    await db.$transaction([
      db.angle.update({ where: { id: angle.id }, data: { status: "HIDDEN", screening: verdict?.result ?? null, screenedAt: verdict ? now : null } }),
      db.report.create({ data: { momentId, angleId: angle.id, reason: "AI", note: note.slice(0, 500) } }),
    ]);
  }
}

// «نشر»: the owner publishes a checked draft — from now on it shows in the moment. A moment
// started without a name gets its name here, from its creator: nothing goes up unnamed.
export async function publishAngle(user: User, angleId: string, title?: unknown) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { named: true, creatorId: true, kind: true, description: true } } } });
  if (!angle || angle.contributorId !== user.id) throw new AngleError("not_found");
  if (angle.status === "READY") return angle; // a retry
  if (angle.status !== "DRAFT") throw new AngleError("forbidden");
  const naming = !angle.moment.named && angle.moment.creatorId === user.id;
  const name = naming && typeof title === "string" ? title.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (naming && !name) throw new AngleError("needs_title");
  const now = new Date();
  // A moment without a description takes the first shot's line (with its #hashtags), so
  // nothing goes up undescribed; the creator may change it. ("" = they cleared it: left so.)
  const describe = angle.moment.description === null && angle.aiText ? { description: angle.aiText } : {};
  const [done] = await db.$transaction([
    db.angle.update({ where: { id: angle.id }, data: { status: "READY" } }),
    db.moment.update({
      where: { id: angle.momentId },
      // A new shot of a story starts its weekly reminders over.
      data: { lastActivityAt: now, ...describe, ...(naming ? { title: name, named: true } : {}), ...(angle.moment.kind === "STORY" ? { reminders: 0, remindedAt: null } : {}) },
    }),
  ]);
  return done;
}

// Uploads nobody published: drafts (and uploads that never finished) older than 3 hours are
// deleted with their files; moments left with no shot at all go too («لا لقطة فارغة» — the
// owner of the site asked that a moment never published never stays). Run hourly by
// /api/cron/cleanup. Never «لحظة اليوم», never anything published. (Home already hides them.)
const STALE_UPLOAD_MS = 3 * 60 * 60 * 1000;
const EMPTY_MOMENTS_FROM = new Date(0);
export async function purgeStaleUploads(now = new Date(), emptyMomentsFrom = EMPTY_MOMENTS_FROM) {
  const before = new Date(now.getTime() - STALE_UPLOAD_MS);
  const stale = await db.angle.findMany({
    where: { status: { in: ["DRAFT", "PROCESSING"] }, uploadedAt: { lt: before } },
    select: { id: true, mediaPath: true, thumbPath: true, smallPath: true, caption: true, streamUid: true },
  });
  if (stale.length) {
    await db.angle.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
    const files = stale.flatMap((a) => [a.mediaPath, a.thumbPath, a.smallPath, parseCaption(a.caption)?.path]).filter((p): p is string => !!p);
    if (files.length) await del(files).catch((error) => console.error("purge: blob cleanup failed", error));
    for (const a of stale) await deleteFromStream(a.streamUid);
  }
  const empty = await db.moment.findMany({
    where: { kind: { not: "DAILY" }, createdAt: { lt: before, gte: emptyMomentsFrom }, angles: { none: {} } },
    select: { id: true },
  });
  let moments = 0;
  for (const m of empty) {
    // One that something still refers to (a report, say) stays.
    if (await db.moment.delete({ where: { id: m.id } }).then(() => true, () => false)) moments++;
  }
  return { shots: stale.length, moments };
}
