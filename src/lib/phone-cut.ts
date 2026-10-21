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
