// Browser-side preparation of an angle before upload. Import only from client components.
import exifr from "exifr";
import { placeAt } from "@/lib/places-client";

export const MAX_VIDEO_SECONDS = 40;
const PHOTO_MAX_EDGE = 2048;
const POSTER_MAX_EDGE = 720;

export type PreparedAngle = {
  mediaType: "PHOTO" | "VIDEO";
  file: Blob;
  contentType: string;
  poster?: Blob;
  capturedAt: string | null;
  // Where it was taken, as a Zawmo place id worked out on the phone (never coordinates).
  placeId?: string | null;
  durationSec?: number;
  width: number;
  height: number;
  trim?: boolean; // longer than 40 s: the server keeps its first 40 seconds
  phoneCut?: boolean; // …already cut here, before it went up (src/lib/phone-cut.ts) — false: it couldn't be
};

export class PrepareError extends Error {
  // too_long carries the file, so the page can offer to send its first seconds instead.
  constructor(
    public code: "unsupported" | "too_long",
    public durationSec?: number,
  ) {
    super(code);
  }
}

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function toJpeg(source: CanvasImageSource, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PrepareError("unsupported"))), "image/jpeg", quality),
  );
}

// The capture time must be read before re-encoding: drawing to a canvas drops all
// metadata, which is also what strips the GPS position from shared photos.
async function readCaptureTime(file: Blob, lastModified: number) {
  try {
    const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate"] });
    const date: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
  } catch {
    // No readable metadata: fall back to the file date below.
  }
  return lastModified ? new Date(lastModified).toISOString() : null;
}

// The photo's GPS position, if it has one, becomes a place id right here; the numbers
// themselves are dropped (and the re-encoded JPEG carries no metadata at all).
async function readPlace(file: Blob) {
  try {
    const gps = await exifr.gps(file);
    return gps ? await placeAt(gps.latitude, gps.longitude) : null;
  } catch {
    return null;
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The picked file, read once into memory (2026-10-20: «غير مدعومة» on the first try, fine on the
// second — a photo from the gallery's cloud (Google Photos) isn't all on the phone yet when picked,
// and three reads of it at once — date, place, picture — failed). Tried three times, a little later
// each time; everything after works on these bytes.
async function readBytes(file: File) {
  let last: unknown;
  for (const wait of [0, 400, 1200]) {
    if (wait) await pause(wait);
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > 0) return new Blob([bytes], { type: file.type || "image/jpeg" });
      last = new Error("empty file");
    } catch (error) {
      last = error;
    }
  }
  throw Object.assign(new PrepareError("unsupported"), { cause: last, stage: "read" });
}

// The picture itself, drawable: an <img> first (browsers apply the EXIF rotation when drawing, so
// portraits stay upright) — `load`, not img.decode(): decode() stalls while the page is in the
// background; then createImageBitmap, which some phones decode when <img> won't.
async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const ok = await within<true>(15_000, (done, fail) => {
      img.onload = () => done(true);
      img.onerror = () => fail();
      img.src = url;
    });
    if (ok && img.naturalWidth > 0) return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    // on to the next way
  }
  URL.revokeObjectURL(url);
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // nothing more to try
    }
  }
  throw Object.assign(new PrepareError("unsupported"), { stage: "decode" });
}

async function preparePhoto(file: File): Promise<PreparedAngle> {
  const blob = await readBytes(file);
  const [capturedAt, placeId] = await Promise.all([readCaptureTime(blob, file.lastModified), readPlace(blob)]);
  // A picture the phone couldn't open at once: once more, a moment later.
  const picture = await decode(blob).catch(() => pause(700).then(() => decode(blob)));
  try {
    const { width, height } = fitWithin(picture.width, picture.height, PHOTO_MAX_EDGE);
    const jpeg = await toJpeg(picture.source, width, height, 0.85).catch(() => pause(500).then(() => toJpeg(picture.source, width, height, 0.8)));
    return { mediaType: "PHOTO", file: jpeg, contentType: "image/jpeg", capturedAt, placeId, width, height };
  } finally {
    picture.close?.();
  }
}

// A browser event, or null when it hasn't come within `ms` (the browser never says no, it just
// never says yes: Android's Chrome with data saver, a big or HEVC video, the person switching apps).
function within<T>(ms: number, start: (done: (value: T) => void, fail: () => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    start(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

// `long`: a video past 40 s whose owner chose «its first 40 seconds»: cut to them here first, by
// copy (src/lib/phone-cut.ts, 2026-10-21 — a 148 MB video went up whole); what can't be cut so goes
// up whole and the server keeps those seconds (src/server/angles.ts trimToLimit). Nothing re-recorded.
// Every wait here has an end (2026-10-19: members' videos spun on «تجهيز» for ever — the phone's
// «loaded» or «seeked» never came). What the phone can't read, the server works out itself: the
// length (it measures every video anyway) and the cover (made from the video when none came).
async function prepareVideo(file: File, long = false, onCut?: (share: number) => void): Promise<PreparedAngle> {
  const type = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4");
  if (!VIDEO_TYPES.includes(type)) throw new PrepareError("unsupported");
  const capturedAt = file.lastModified ? new Date(file.lastModified).toISOString() : null;
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // Its length and size come with the metadata — earlier and surer than a first frame.
    const meta = await within<true>(15_000, (done, fail) => {
      video.onloadedmetadata = () => done(true);
      video.onerror = () => fail();
      video.src = url;
      video.load();
    });
    const durationSec = meta ? video.duration : NaN;
    const known = Number.isFinite(durationSec) && durationSec > 0;
    if (known && durationSec > MAX_VIDEO_SECONDS + 0.5 && !long) throw new PrepareError("too_long", durationSec);

    // The cover: a frame half a second in, if the phone gets there in time.
    let poster: Blob | undefined;
    if (meta && video.videoWidth > 0) {
      const seeked = await within<true>(8_000, (done) => {
        video.onseeked = () => done(true);
        video.currentTime = known ? Math.min(0.5, durationSec / 2) : 0.1;
      });
      if (seeked || video.readyState >= 2) {
        const size = fitWithin(video.videoWidth, video.videoHeight, POSTER_MAX_EDGE);
        poster = await toJpeg(video, size.width, size.height, 0.8).catch(() => undefined);
      }
    }

    const tooLong = (known && durationSec > MAX_VIDEO_SECONDS + 0.5) || (!known && long);
    const cut = long && tooLong ? await import("@/lib/phone-cut").then((m) => m.cutFirstSeconds(file, onCut)).catch(() => null) : null;

    return {
      mediaType: "VIDEO",
      file: cut ?? file,
      contentType: cut ? "video/mp4" : type,
      poster,
      capturedAt,
      ...(known ? { durationSec: Math.min(durationSec, MAX_VIDEO_SECONDS) } : {}),
      // (still marked: the server measures it, and cuts only what is still too long)
      ...(tooLong ? { trim: true, phoneCut: !!cut } : {}),
      width: video.videoWidth || 720,
      height: video.videoHeight || 1280,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function prepareAngleFile(file: File, long = false, onCut?: (share: number) => void) {
  // (some Android galleries hand a video over with no type at all: its name says what it is)
  if (file.type.startsWith("video/") || (!file.type && /\.(mp4|mov|webm|m4v)$/i.test(file.name))) return prepareVideo(file, long, onCut);
  // (a photo with no type at all — some apps hand one over so — goes by its name)
  if (file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(file.name)) return preparePhoto(file);
  return Promise.reject(new PrepareError("unsupported"));
}
