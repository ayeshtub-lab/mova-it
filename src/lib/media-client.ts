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
async function readCaptureTime(file: File) {
  try {
    const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate"] });
    const date: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
  } catch {
    // No readable metadata: fall back to the file date below.
  }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
}

// The photo's GPS position, if it has one, becomes a place id right here; the numbers
// themselves are dropped (and the re-encoded JPEG carries no metadata at all).
async function readPlace(file: File) {
  try {
    const gps = await exifr.gps(file);
    return gps ? await placeAt(gps.latitude, gps.longitude) : null;
  } catch {
    return null;
  }
}

async function preparePhoto(file: File): Promise<PreparedAngle> {
  const [capturedAt, placeId] = await Promise.all([readCaptureTime(file), readPlace(file)]);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    // `load`, not img.decode(): decode() stalls while the page is in the background
    // (e.g. the user switched to WhatsApp mid-upload). Browsers apply the EXIF
    // rotation when drawing, so portraits stay upright.
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new PrepareError("unsupported"));
      img.src = url;
    });
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, PHOTO_MAX_EDGE);
    const jpeg = await toJpeg(img, width, height, 0.85);
    return { mediaType: "PHOTO", file: jpeg, contentType: "image/jpeg", capturedAt, placeId, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareVideo(file: File): Promise<PreparedAngle> {
  if (!VIDEO_TYPES.includes(file.type)) throw new PrepareError("unsupported");
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new PrepareError("unsupported"));
    });
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new PrepareError("unsupported");
    if (durationSec > MAX_VIDEO_SECONDS + 0.5) throw new PrepareError("too_long", durationSec);

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(0.5, durationSec / 2);
    });
    const size = fitWithin(video.videoWidth, video.videoHeight, POSTER_MAX_EDGE);
    const poster = await toJpeg(video, size.width, size.height, 0.8);

    return {
      mediaType: "VIDEO",
      file,
      contentType: file.type,
      poster,
      capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      durationSec,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function prepareAngleFile(file: File) {
  if (file.type.startsWith("video/")) return prepareVideo(file);
  if (file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)) return preparePhoto(file);
  return Promise.reject(new PrepareError("unsupported"));
}
