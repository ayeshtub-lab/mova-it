// Recording video in the browser (MediaRecorder), for Zawmo's own camera and for sending
// the first 40 seconds of a longer gallery video. Import only from client components.
import { MAX_VIDEO_SECONDS, PrepareError, toJpeg, type PreparedAngle } from "@/lib/media-client";

const POSTER_MAX_EDGE = 720;
// MP4 first: it plays everywhere (iPhones included); WebM where MP4 can't be recorded.
const TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

export const canRecord = () => typeof window !== "undefined" && "MediaRecorder" in window && TYPES.some((t) => MediaRecorder.isTypeSupported(t));

export function recordingType() {
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new PrepareError("unsupported");
  return { mime: type, contentType: type.startsWith("video/mp4") ? "video/mp4" : "video/webm", ext: type.startsWith("video/mp4") ? "mp4" : "webm" };
}

// A recording is already known — length, size and first frame — so it goes straight to
// upload without being read back (recorded WebM files often don't state their length).
export function recordedAngle(file: Blob, contentType: string, durationSec: number, poster: Blob, width: number, height: number): PreparedAngle {
  return {
    mediaType: "VIDEO",
    file,
    contentType,
    poster,
    capturedAt: new Date().toISOString(),
    durationSec: Math.min(durationSec, MAX_VIDEO_SECONDS),
    width,
    height,
  };
}

export async function posterOf(source: HTMLVideoElement | HTMLCanvasElement, width: number, height: number) {
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
  return toJpeg(source, Math.round(width * scale), Math.round(height * scale), 0.8);
}

// Starts recording a stream; `stop()` resolves with the video.
export function startRecording(stream: MediaStream) {
  const { mime, contentType, ext } = recordingType();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => (chunks.length ? resolve(new Blob(chunks, { type: contentType })) : reject(new PrepareError("unsupported")));
    recorder.onerror = () => reject(new PrepareError("unsupported"));
  });
  recorder.start(1000);
  return {
    contentType,
    ext,
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
  };
}

// The first `seconds` of a longer video, re-recorded in real time: its frames drawn onto a
// canvas, its sound taken through Web Audio (so nothing plays out loud). Takes as long as
// the part it keeps, and needs the page on screen meanwhile.
export async function firstSeconds(file: File, onProgress: (seconds: number) => void, seconds = MAX_VIDEO_SECONDS): Promise<PreparedAngle> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  const audio = new AudioContext();
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new PrepareError("unsupported"));
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    // Large frames are scaled to 1080p, the size everything is shown at anyway.
    const scale = Math.min(1, 1920 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((width * scale) / 2) * 2;
    canvas.height = Math.round((height * scale) / 2) * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await posterOf(canvas, canvas.width, canvas.height);

    const sound = audio.createMediaStreamDestination();
    audio.createMediaElementSource(video).connect(sound);
    await audio.resume();
    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress(Math.min(seconds, video.currentTime));
      requestAnimationFrame(draw);
    };
    // The picture track is made — and recording starts — only once the video is really
    // playing: a track made earlier starts its clock early, and its first frame would be
    // stretched over the wait (a still picture leading the clip).
    // In the page (invisibly): some browsers decode a detached video slowly. And wait for
    // the first frame that really moves — the decoder can lag the sound for a second.
    video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.append(video);
    const playing = new Promise<void>((resolve) => video.addEventListener("playing", () => resolve(), { once: true }));
    await video.play();
    await playing;
    await new Promise<void>((resolve) => {
      const started = video.currentTime;
      const moved = () => (video.currentTime > started ? resolve() : setTimeout(moved, 10));
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => moved());
      else moved();
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...sound.stream.getAudioTracks()]);
    const recording = startRecording(stream);
    requestAnimationFrame(draw);
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (video.currentTime >= seconds || video.ended) resolve();
        else if (document.hidden) reject(new PrepareError("unsupported"));
        else setTimeout(check, 50);
      };
      check();
    });
    drawing = false;
    video.pause();
    const blob = await recording.stop();
    stream.getTracks().forEach((t) => t.stop());
    return recordedAngle(blob, recording.contentType, Math.min(seconds, video.currentTime), poster, canvas.width, canvas.height);
  } finally {
    video.pause();
    video.remove();
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
    audio.close().catch(() => {});
  }
}
