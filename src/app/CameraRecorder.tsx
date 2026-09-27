"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PreparedAngle } from "@/lib/media-client";
import { MAX_VIDEO_SECONDS } from "@/lib/media-client";
import { posterOf, recordedAngle, startRecording } from "@/lib/recording";

export type CameraLabels = { title: string; record: string; stop: string; switchCamera: string; close: string; hint: string; denied: string; useNative: string };

// Zawmo's own video camera: a live preview, one big button, and a countdown from 40 that
// stops the recording by itself. (The phone's camera app, opened through a file input,
// can't show a countdown or stop at 40 seconds.)
export function CameraRecorder({ labels, onDone, onNative, onClose }: { labels: CameraLabels; onDone: (video: PreparedAngle) => void; onNative: () => void; onClose: () => void }) {
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recording = useRef<ReturnType<typeof startRecording> | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [state, setState] = useState<"starting" | "ready" | "recording" | "saving" | "denied">("starting");
  const [left, setLeft] = useState(MAX_VIDEO_SECONDS);
  const startedAt = useRef(0);
  const poster = useRef<Promise<Blob> | null>(null);

  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Open (or switch) the camera, with the microphone.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        release();
        stream.current = s;
        if (preview.current) {
          preview.current.srcObject = s;
          preview.current.play().catch(() => {});
        }
        setState("ready");
      })
      .catch(() => !cancelled && setState("denied"));
    return () => {
      cancelled = true;
    };
  }, [facing]);

  // Leaving the camera (or the page) always switches it off.
  useEffect(() => release, []);

  const stop = useCallback(async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    setState("saving");
    const seconds = (performance.now() - startedAt.current) / 1000;
    try {
      const blob = await current.stop();
      const video = preview.current!;
      const angle = recordedAngle(blob, current.contentType, seconds, await poster.current!, video.videoWidth, video.videoHeight);
      release();
      onDone(angle);
    } catch {
      setState("ready");
    }
  }, [onDone]);

  function record() {
    if (!stream.current || !preview.current) return;
    const video = preview.current;
    poster.current = posterOf(video, video.videoWidth, video.videoHeight);
    recording.current = startRecording(stream.current);
    startedAt.current = performance.now();
    setLeft(MAX_VIDEO_SECONDS);
    setState("recording");
  }

  // The countdown; at zero the recording stops by itself.
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, MAX_VIDEO_SECONDS - (performance.now() - startedAt.current) / 1000);
      setLeft(remaining);
      if (remaining <= 0) stop();
    }, 200);
    return () => clearInterval(timer);
  }, [state, stop]);

  const secondsLeft = Math.ceil(left);
  const progress = 1 - left / MAX_VIDEO_SECONDS;
  const R = 44;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={labels.title}>
      <video ref={preview} muted playsInline className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />

      {/* Top: close, and the countdown while recording. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            recording.current?.stop().catch(() => {});
            recording.current = null;
            release();
            onClose();
          }}
          aria-label={labels.close}
          className="flex size-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm"
        >
          <svg viewBox="0 0 24 24" className="size-6 stroke-white" fill="none" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {state === "recording" ? (
          <span className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-lg font-extrabold tabular-nums" aria-live="polite">
            <span className="size-2.5 animate-pulse rounded-full bg-white" /> {secondsLeft}
          </span>
        ) : (
          <span className="rounded-full bg-black/45 px-3 py-1 text-sm font-bold backdrop-blur-sm">{labels.hint}</span>
        )}
        <span className="size-11" />
      </div>

      {state === "denied" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-8 text-center">
          <p className="leading-relaxed">{labels.denied}</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNative();
            }}
            className="min-h-12 rounded-full bg-accent px-6 font-bold"
          >
            {labels.useNative}
          </button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-10 p-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <span className="size-12" />
          {/* The button: a ring that fills as the 40 seconds run out. */}
          <button
            type="button"
            onClick={state === "recording" ? stop : record}
            disabled={state !== "ready" && state !== "recording"}
            aria-label={state === "recording" ? labels.stop : labels.record}
            className="relative flex size-24 items-center justify-center disabled:opacity-50"
          >
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="6" />
              {state === "recording" && <circle cx="50" cy="50" r={R} fill="none" stroke="#ffbf1f" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />}
            </svg>
            <span className={`bg-accent transition-all ${state === "recording" ? "size-9 rounded-lg" : "size-16 rounded-full"}`} />
          </button>
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            disabled={state === "recording" || state === "saving"}
            aria-label={labels.switchCamera}
            className="flex size-12 items-center justify-center rounded-full bg-black/45 text-2xl backdrop-blur-sm disabled:opacity-40"
          >
            🔄
          </button>
        </div>
      )}
    </div>
  );
}
