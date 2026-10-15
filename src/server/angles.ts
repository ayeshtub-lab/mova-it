import { staffOver } from "@/lib/staff";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, list, put } from "@vercel/blob";
import { MediaType, PlaceSource, Presence } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseCaption } from "@/lib/caption";
import { blobExists, viewUrl } from "@/server/media";
import { ffmpeg, probeDuration } from "@/server/ffmpeg";
import { screenAngle, screeningEnabled, screenText, type ShotContext } from "@/server/screening";
import { deleteFromStream } from "@/server/stream";
import { searchesForGemini } from "@/server/search-console";

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
  // (A longer one, whose first 40 seconds the server keeps, may be bigger: 1 GB at most.)
  return { angleId: angle.id, allowedContentTypes: Object.keys(VIDEO_TYPES), maximumSizeInBytes: 1024 * 1024 * 1024 };
}

// «🖼️ الغلاف»: its owner picks a frame of their video as its cover. Saved under a new name
// (so no old copy lingers in a cache) and the previous one removed.
const JPEG = [0xff, 0xd8, 0xff];
export async function setVideoCover(user: User, angleId: string, bytes: Buffer) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { id: true, momentId: true, contributorId: true, mediaType: true, thumbPath: true, status: true } });
  if (!angle || angle.contributorId !== user.id || angle.mediaType !== MediaType.VIDEO || !["PROCESSING", "DRAFT", "READY"].includes(angle.status)) throw new AngleError("not_found");
  if (bytes.length < 1000 || bytes.length > 2 * 1024 * 1024 || !JPEG.every((b, i) => bytes[i] === b)) throw new AngleError("invalid_media");
  const path = `m/${angle.momentId}/${angle.id}-cover-${Date.now().toString(36)}.jpg`;
  await put(path, bytes, { access: "private", contentType: "image/jpeg", addRandomSuffix: false });
  await db.angle.update({ where: { id: angle.id }, data: { thumbPath: path } });
  if (angle.thumbPath && angle.thumbPath !== path) await del(angle.thumbPath).catch(() => {});
}

// Deletes an angle for good: its files, its reactions, and every montage it appears in
// (so deleted footage does not live on inside an old montage). Allowed for the person
// who added it and for the moment's creator, who moderates their moment.
export async function deleteAngle(user: User, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  if (!angle || (angle.contributorId !== user.id && angle.moment.creatorId !== user.id && !staffOver(user, angle.moment))) throw new AngleError("not_found");

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
  if (!moment || (moment.creatorId !== user.id && !staffOver(user, moment)) || moment.kind === "DAILY") throw new AngleError("not_found");
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
// «its first 40 seconds»: a longer video, uploaded whole, cut on the server — copied as it is
// (no re-encoding: seconds, full quality), or re-encoded when its streams can't be copied into
// the container. The cut replaces the upload, which is removed.
async function trimToLimit(angle: { id: string; momentId: string; mediaPath: string }) {
  const source = (await viewUrl(angle.mediaPath))!;
  const webm = angle.mediaPath.endsWith(".webm");
  const dir = await mkdtemp(join(tmpdir(), "zawmo-trim-"));
  try {
    let out = join(dir, webm ? "cut.webm" : "cut.mp4");
    const keep = String(MAX_VIDEO_SECONDS - 0.1);
    try {
      await ffmpeg(["-i", source, "-t", keep, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", ...(webm ? [] : ["-movflags", "+faststart"]), out], 120_000);
    } catch (error) {
      console.error("trim by copy failed, re-encoding", angle.id, String(error).slice(0, 200));
      out = join(dir, "cut.mp4");
      await ffmpeg(["-i", source, "-t", keep, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out], 240_000);
    }
    const ext = out.endsWith(".webm") ? "webm" : "mp4";
    const path = `m/${angle.momentId}/${angle.id}-40.${ext}`;
    await put(path, await readFile(out), { access: "private", contentType: `video/${ext}`, addRandomSuffix: false, allowOverwrite: true });
    await db.angle.update({ where: { id: angle.id }, data: { mediaPath: path } });
    await del(angle.mediaPath).catch((error) => console.error("trim: old file not removed", angle.id, error));
    return path;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function completeAngle(user: User, angleId: string, options: { trim?: boolean } = {}) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: true } });
  if (!angle || angle.contributorId !== user.id) throw new AngleError("not_found");
  // Already done (a retry): report what happened the first time.
  if (angle.status === "DRAFT" || angle.status === "READY" || (angle.status === "HIDDEN" && angle.screening === "blocked")) return Object.assign(angle, { titleSuggestion: null as string | null, captionIdeas: [] as string[], wentLive: false });
  if (angle.status !== "PROCESSING") throw new AngleError("forbidden");

  const needed = [angle.mediaPath, angle.thumbPath].filter((p): p is string => !!p);
  const present = await Promise.all(needed.map(blobExists));
  if (present.includes(false)) throw new AngleError("not_uploaded");

  // The phone said how long the video is; the server measures it itself (a tampered upload
  // can't slip a 10-minute video past the 40-second limit). Too long → gone, files and all.
  if (angle.mediaType === MediaType.VIDEO && angle.mediaPath) {
    let measured = await probeDuration((await viewUrl(angle.mediaPath))!);
    // Its owner chose «its first 40 seconds»: kept here, then measured again.
    if (options.trim && measured != null && measured > MAX_VIDEO_SECONDS + VIDEO_SECONDS_TOLERANCE) {
      angle.mediaPath = await trimToLimit({ id: angle.id, momentId: angle.momentId, mediaPath: angle.mediaPath });
      measured = await probeDuration((await viewUrl(angle.mediaPath))!);
    }
    if (measured != null && measured > MAX_VIDEO_SECONDS + VIDEO_SECONDS_TOLERANCE) {
      await db.angle.delete({ where: { id: angle.id } });
      await del(needed).catch((error) => console.error("too long: blob cleanup failed", angle.id, error));
      throw new AngleError("too_long");
    }
    if (measured == null) console.error("could not measure video length", angle.id);
    else angle.durationSec = Math.round(measured * 10) / 10;
  }

  // Automatic check before anyone sees it. Blocked → hidden and queued for the admins.
  // The check itself failing (Gemini busy, timed out, an empty answer) is NOT a verdict: tried
  // three times, and if it still fails the shot goes up like any other — in a public moment
  // seen only by its owner and the moment's creator (src/server/moments.ts) until the
  // recheck every 10 minutes clears it (recheckUnscreened). Ordinary shots — a snake, a tree —
  // were refused as «against the rules» only because the check failed.
  const verdict = screeningEnabled() ? await screenWithRetry(angle) : null;
  if (verdict?.result === "error") console.error("screening failed", angle.id, verdict.reason);
  const blocked = verdict?.result === "blocked";

  const now = new Date();
  // The lens's name for the shot, offered when the moment was started without one.
  const titleSuggestion = verdict?.result === "allowed" ? (verdict.title ?? null) : null;
  // …and lines to write on it («✍️»), offered right after upload (not kept).
  const captionIdeas = verdict?.result === "allowed" ? (verdict.captions ?? []) : [];
  // Clearly someone else's (another app's watermark, a TV logo, a film, a captured screen): it
  // stays with its owner and the moment's creator — never shown to everyone, never in a film —
  // and an admin looks at it (screening «repost»). Never an official account's (✓): Zawmo's own
  // promos and ads are ours to post.
  const repost = verdict?.result === "allowed" && verdict.repost && !user.verified ? verdict.repost : null;
  const saved = await db.$transaction(async (tx) => {
    const done = await tx.angle.update({
      where: { id: angle.id },
      data: {
        // Fine → a draft only its owner sees, until they press «نشر» (after «صوّر معك» looked).
        status: blocked ? "HIDDEN" : "DRAFT",
        expiresAt: null, // shots are kept until their owner deletes them
        screening: repost ? "repost" : (verdict?.result ?? null),
        durationSec: angle.durationSec,
        scene: verdict?.result === "allowed" ? (verdict.scene ?? null) : null,
        seenText: verdict?.result === "allowed" ? (verdict.seen ?? null) : null,
        aiText: verdict?.result === "allowed" ? (verdict.text ?? null) : null,
        aiTitle: verdict?.result === "allowed" ? (verdict.seoTitle ?? null) : null,
        screenedAt: verdict ? now : null,
      },
    });
    if (blocked) {
      const note = verdict?.result === "blocked" ? `${verdict.category}: ${verdict.reason}` : "";
      await tx.report.create({ data: { momentId: angle.momentId, angleId: angle.id, reason: "AI", note: note.slice(0, 500) } });
    }
    if (repost && !blocked) await tx.report.create({ data: { momentId: angle.momentId, angleId: angle.id, reason: "REPOST", note: repost.slice(0, 500) } });
    return done;
  });
  // «نشر» was pressed while it was being checked: up now (the route tells its owner).
  if (!blocked && saved.autoPublish) {
    const moment = await db.moment.findUniqueOrThrow({ where: { id: saved.momentId }, select: { description: true, kind: true } });
    const live = await goLive({ ...saved, moment });
    return Object.assign(live, { titleSuggestion, captionIdeas, wentLive: true });
  }
  return Object.assign(saved, { titleSuggestion, captionIdeas, wentLive: false });
}

// What the app knows for sure about a shot, for its SEO title and description: the moment's
// name, the place (the shot's own, else the moment's) and the year it was taken.
export async function shotContext(angle: { momentId: string; placeId: string | null; capturedAt: Date | null }): Promise<ShotContext> {
  const moment = await db.moment.findUnique({ where: { id: angle.momentId }, select: { title: true, named: true, placeId: true, placeName: true } });
  const placeId = angle.placeId ?? moment?.placeId ?? null;
  const place = placeId ? await db.place.findUnique({ where: { id: placeId }, select: { nameAr: true, kind: true } }) : null;
  return {
    moment: moment?.named ? moment.title : null,
    place: place ? (place.kind === "GOVERNORATE" ? `محافظة ${place.nameAr}` : place.nameAr) : (moment?.placeName ?? null),
    year: angle.capturedAt?.getFullYear() ?? null,
    searches: await searchesForGemini().catch(() => []),
  };
}

// The check, tried again (a little later each time) when it fails rather than answers.
const SCREEN_RETRY_MS = [2000, 5000];
async function screenWithRetry(angle: Parameters<typeof screenAngle>[0] & Parameters<typeof shotContext>[0]) {
  const context = await shotContext(angle).catch(() => undefined);
  let verdict = await screenAngle(angle, context);
  for (const wait of SCREEN_RETRY_MS) {
    if (verdict.result !== "error") break;
    await new Promise((r) => setTimeout(r, wait));
    verdict = await screenAngle(angle, context);
  }
  return verdict;
}

// Every 10 minutes (cron «branded»): shots whose check failed are checked again — a few per
// run, for two days at most (after that they stay with their owner and an admin is told once).
// Fine → shown to everyone; clearly against the rules → hidden for the admins.
const RECHECK_FOR_MS = 48 * 60 * 60 * 1000;
export async function recheckUnscreened(take = 4) {
  if (!screeningEnabled()) return 0;
  const since = new Date(Date.now() - RECHECK_FOR_MS);
  const angles = await db.angle.findMany({
    where: { screening: "error", status: { in: ["DRAFT", "READY"] }, uploadedAt: { gt: since } },
    orderBy: { uploadedAt: "asc" },
    take,
    include: { contributor: { select: { verified: true } } },
  });
  let done = 0;
  for (const angle of angles) {
    const verdict = await screenAngle(angle, await shotContext(angle).catch(() => undefined));
    const now = new Date();
    if (verdict.result === "allowed") {
      const repost = verdict.repost && !angle.contributor.verified ? verdict.repost : null;
      await db.angle.update({ where: { id: angle.id }, data: { screening: repost ? "repost" : "allowed", screenedAt: now, scene: verdict.scene ?? null, seenText: verdict.seen ?? null, aiText: verdict.text ?? null, aiTitle: verdict.seoTitle ?? null } });
      if (repost) await db.report.create({ data: { momentId: angle.momentId, angleId: angle.id, reason: "REPOST", note: repost.slice(0, 500) } });
      done++;
    } else if (verdict.result === "blocked") {
      await db.$transaction([
        db.angle.update({ where: { id: angle.id }, data: { status: "HIDDEN", screening: "blocked", screenedAt: now } }),
        db.report.create({ data: { momentId: angle.momentId, angleId: angle.id, reason: "AI", note: `${verdict.category}: ${verdict.reason}`.slice(0, 500) } }),
      ]);
      done++;
    }
  }
  // Two days of failed checks: an admin looks (once), the shot stays where it is.
  const stuck = await db.angle.findMany({ where: { screening: "error", status: { in: ["DRAFT", "READY"] }, uploadedAt: { lte: since }, reports: { none: { reason: "AI" } } }, select: { id: true, momentId: true }, take: 10 });
  for (const a of stuck) await db.report.create({ data: { momentId: a.momentId, angleId: a.id, reason: "AI", note: "not checked for 2 days (check kept failing)" } });
  return done;
}

// Public shots described before the SEO rules (2026-10-14), or left without a title: described
// again — a few per run of the cron «branded» — with the rules and what the app knows (moment,
// place, year). Only their words change: the check's verdict stays as it was. Gemini failing
// stops the run (the next one, 10 minutes later, tries again); a shot it answers without a
// title gets "" so it is not asked twice.
export async function describePending(take = 8) {
  if (!screeningEnabled()) return 0;
  const shots = await db.angle.findMany({
    where: { aiTitle: null, status: "READY", screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE" } },
    orderBy: { uploadedAt: "desc" },
    take,
    select: { id: true, momentId: true, placeId: true, capturedAt: true, mediaType: true, mediaPath: true, thumbPath: true, durationSec: true },
  });
  let done = 0;
  for (const shot of shots) {
    const verdict = await screenAngle(shot, await shotContext(shot).catch(() => undefined));
    if (verdict.result === "error") {
      console.error("describe failed", shot.id, verdict.reason);
      break;
    }
    // (A second look that disagrees with the first is left to the admins, never acted on here.)
    if (verdict.result === "blocked") console.error("describe: second look would block", shot.id, verdict.category);
    await db.angle.update({
      where: { id: shot.id },
      data: verdict.result === "allowed" ? { aiTitle: verdict.seoTitle ?? "", ...(verdict.text ? { aiText: verdict.text } : {}) } : { aiTitle: "" },
    });
    done++;
  }
  return done;
}

// A moment just became public: angles added before (unchecked, or checked while the
// check was failing) are checked now. (Explicit null: in SQL, NULL <> "allowed" is not true.) Anything not clearly fine is hidden for an admin.
export async function screenForPublic(momentId: string) {
  // The description too: one that does not pass is removed rather than shown to everyone.
  const moment = await db.moment.findUnique({ where: { id: momentId }, select: { description: true } });
  if (moment?.description && (await screenText(moment.description)).result !== "allowed") {
    await db.moment.update({ where: { id: momentId }, data: { description: null } });
  }
  const angles = await db.angle.findMany({ where: { momentId, status: "READY", OR: [{ screening: null }, { screening: { not: "allowed" } }] }, include: { contributor: { select: { verified: true } } } });
  for (const angle of angles) {
    const verdict = screeningEnabled() ? await screenAngle(angle, await shotContext(angle).catch(() => undefined)) : null;
    const now = new Date();
    if (verdict?.result === "allowed") {
      const repost = verdict.repost && !angle.contributor.verified; // (an official account's: never)
      await db.angle.update({ where: { id: angle.id }, data: { screening: repost ? "repost" : "allowed", screenedAt: now, scene: verdict.scene ?? null, seenText: verdict.seen ?? null, aiText: verdict.text ?? null, aiTitle: verdict.seoTitle ?? null } });
      if (verdict.repost && repost && !(await db.report.count({ where: { angleId: angle.id, reason: "REPOST", resolvedAt: null } }))) {
        await db.report.create({ data: { momentId, angleId: angle.id, reason: "REPOST", note: verdict.repost.slice(0, 500) } });
      }
      continue;
    }
    // The check failing is no verdict: kept from everyone but its people until rechecked.
    if (verdict?.result === "error") {
      await db.angle.update({ where: { id: angle.id }, data: { screening: "error" } });
      continue;
    }
    const note = verdict?.result === "blocked" ? `${verdict.category}: ${verdict.reason}` : "public, not checked: screening off";
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
  if (angle.status !== "DRAFT" && angle.status !== "PROCESSING") throw new AngleError("forbidden");
  const naming = !angle.moment.named && angle.moment.creatorId === user.id;
  const name = naming && typeof title === "string" ? title.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (naming && !name) throw new AngleError("needs_title");
  // Still being checked: «نشر» is remembered and the server publishes it once it is fine
  // (completeAngle) — its owner may leave meanwhile and is told when it's up (SHOT_READY).
  if (angle.status === "PROCESSING") {
    await db.$transaction([
      db.angle.update({ where: { id: angle.id }, data: { autoPublish: true } }),
      ...(naming ? [db.moment.update({ where: { id: angle.momentId }, data: { title: name, named: true } })] : []),
    ]);
    return Object.assign(angle, { autoPublish: true });
  }
  return goLive(angle, naming ? name : undefined);
}

// A shot's line as a moment's description (≤ 150): its words cut at a word, then its first hashtags.
function momentLine(aiText: string) {
  if (aiText.length <= 150) return aiText;
  const words = aiText.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const cut = words.length <= 120 ? words : `${words.slice(0, 120).replace(/\s+\S*$/, "")}…`;
  let out = cut;
  for (const tag of aiText.match(/#\S+/g) ?? []) if (`${out} ${tag}`.length <= 150) out += ` ${tag}`;
  return out;
}

// A checked draft goes up: shown in the moment, the moment named and described if it wasn't.
async function goLive(angle: { id: string; momentId: string; aiText: string | null; moment: { description: string | null; kind: string } }, naming?: string) {
  const now = new Date();
  // A moment without a description takes the first shot's line (with its #hashtags), so
  // nothing goes up undescribed; the creator may change it. ("" = they cleared it: left so.)
  const describe = angle.moment.description === null && angle.aiText ? { description: momentLine(angle.aiText) } : {};
  const [done] = await db.$transaction([
    db.angle.update({ where: { id: angle.id }, data: { status: "READY", autoPublish: false } }),
    db.moment.update({
      where: { id: angle.momentId },
      // A new shot of a story starts its weekly reminders over.
      data: { lastActivityAt: now, ...describe, ...(naming ? { title: naming, named: true } : {}), ...(angle.moment.kind === "STORY" ? { reminders: 0, remindedAt: null } : {}) },
    }),
  ]);
  return done;
}

// Uploads nobody published: a checked draft waits 48 hours for «نشر» (its owner is reminded
// after an hour — src/server/drafts.ts — and finds it waiting on the moment), an upload that
// never finished 3 hours; then they are deleted with their files. Moments with no shot at all
// go after 3 hours («لا لقطة فارغة» — the owner of the site asked that a moment never
// published never stays; a draft is never seen by anyone but its owner meanwhile). Run hourly
// by /api/cron/cleanup. Never «لحظة اليوم», never anything published.
export const DRAFT_KEPT_MS = 48 * 60 * 60 * 1000;
const STALE_UPLOAD_MS = 3 * 60 * 60 * 1000;
const EMPTY_MOMENTS_FROM = new Date(0);
export async function purgeStaleUploads(now = new Date(), emptyMomentsFrom = EMPTY_MOMENTS_FROM) {
  const before = new Date(now.getTime() - STALE_UPLOAD_MS);
  const draftsBefore = new Date(now.getTime() - DRAFT_KEPT_MS);
  const stale = await db.angle.findMany({
    where: {
      OR: [
        { status: "DRAFT", uploadedAt: { lt: draftsBefore } },
        { status: "PROCESSING", uploadedAt: { lt: before } },
      ],
    },
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

// «✏️ عنوان ووصف اللقطة» — Zawmo's own accounts (src/lib/staff.ts) fix a public shot's search
// title (aiTitle) and line (aiText, with its #hashtags) when the AI got them wrong. Only on a
// public moment; screened shots are never re-described, so the fix stays.
export async function updateShotSeo(user: User, angleId: string, input: { title?: unknown; text?: unknown }) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { visibility: true } } } });
  if (!angle || !staffOver(user, angle.moment)) throw new AngleError("not_found");
  const tidy = (raw: unknown, max: number) => (typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
  const title = tidy(input.title, 90);
  const text = tidy(input.text, 400);
  if (!title) throw new AngleError("needs_title");
  return db.angle.update({ where: { id: angle.id }, data: { aiTitle: title, aiText: text || null }, select: { aiTitle: true, aiText: true } });
}
