import { MAX_VIDEO_SECONDS } from "@/lib/media-client";

// A video past 40 s, its owner chose «its first 40 seconds»: cut on the phone before it goes up
// (2026-10-21) — a 148 MB Android video went up whole for the server to keep 40 s of it. Copied,
// never re-encoded (`copy: forced`): the same picture and sound, the same orientation, in a second
// or two, on any phone, and no frame past the 40 s (`shrink`). Anything it can't do so (a WebM, a
// track it can't copy, a file it can't read, too slow) → null, and the whole video goes up as before
// for the server to cut (src/server/angles.ts trimToLimit) — never a worse upload than before.
export async function cutFirstSeconds(file: Blob, onProgress?: (share: number) => void, timeoutMs = 60_000): Promise<Blob | null> {
  if (/webm/i.test(file.type)) return null;
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: [mb.MP4, mb.QTFF], source: new mb.BlobSource(file) });
  try {
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const hadAudio = (await input.getAudioTracks()).length > 0;
    const conversion = await mb.Conversion.init({
      input,
      output,
      trim: { start: 0, end: MAX_VIDEO_SECONDS - 0.1 },
      copy: { mode: "forced", boundaryPolicy: "shrink" },
      showWarnings: false,
    });
    const used = conversion.utilizedTracks;
    // Both its picture and (if it had one) its sound, or not at all.
    if (!conversion.isValid || !used.some((t) => t.isVideoTrack()) || (hadAudio && !used.some((t) => t.isAudioTrack()))) return null;
    if (onProgress) conversion.onProgress = (share) => onProgress(share);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), timeoutMs)));
    try {
      if ((await Promise.race([conversion.execute(), late])) === "late") {
        void conversion.cancel().catch(() => {});
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
    const buffer = target.buffer;
    // (Something must have gone wrong if it isn't smaller than what it was cut from.)
    if (!buffer || buffer.byteLength < 10_000 || buffer.byteLength >= file.size) return null;
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    console.error("phone cut failed", error);
    return null;
  } finally {
    input.dispose();
  }
}

// «ضغط الفيديو على الجوال» (his OK in October, built 2026-11-10): a phone's 40 s video in full HD can be
// 60–150 MB, and on a weak connection it never finishes going up — on 10/11 a member tried one three
// times in ten minutes and none arrived (the server gave each its upload, the phone never said done).
// So a big video is made smaller here first: its longer side at most 1280 px, H.264 at ~2.5 Mb/s
// (≈12 MB for 40 s), its sound as it was — with the phone's own encoder (WebCodecs), usually faster
// than the video plays. Anything it can't do (no encoder, a WebM, a track it can't keep, too slow,
// or the result not clearly smaller) → null, and the original goes up as before: never worse.
export const COMPRESS_FROM_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 1280;
const BITRATE = 2_500_000;

export async function compressVideo(file: Blob, onProgress?: (share: number) => void, timeoutMs = 150_000): Promise<{ file: Blob; width: number; height: number } | null> {
  if (file.size < COMPRESS_FROM_BYTES || /webm/i.test(file.type) || typeof VideoEncoder === "undefined") return null;
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: [mb.MP4, mb.QTFF], source: new mb.BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(track.displayWidth, track.displayHeight));
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    const width = even(track.displayWidth);
    const height = even(track.displayHeight);
    if (!(await mb.canEncodeVideo("avc", { width, height, bitrate: BITRATE }).catch(() => false))) return null;
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const hadAudio = (await input.getAudioTracks()).length > 0;
    const conversion = await mb.Conversion.init({
      input,
      output,
      trim: { start: 0, end: MAX_VIDEO_SECONDS + 0.4 },
      video: { width, height, fit: "contain", codec: "avc", bitrate: BITRATE, forceTranscode: true },
      showWarnings: false,
    });
    const used = conversion.utilizedTracks;
    if (!conversion.isValid || !used.some((t) => t.isVideoTrack()) || (hadAudio && !used.some((t) => t.isAudioTrack()))) return null;
    if (onProgress) conversion.onProgress = (share) => onProgress(share);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), timeoutMs)));
    try {
      if ((await Promise.race([conversion.execute(), late])) === "late") {
        void conversion.cancel().catch(() => {});
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
    const buffer = target.buffer;
    // Worth it only when clearly smaller (a phone's video already small stays as it was).
    if (!buffer || buffer.byteLength < 10_000 || buffer.byteLength > file.size * 0.8) return null;
    return { file: new Blob([buffer], { type: "video/mp4" }), width, height };
  } catch (error) {
    console.error("phone compress failed", error);
    return null;
  } finally {
    input.dispose();
  }
}
