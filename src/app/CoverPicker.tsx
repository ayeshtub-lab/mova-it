"use client";

import { useEffect, useRef, useState } from "react";
import { toJpeg } from "@/lib/media-client";

export type CoverLabels = { open: string; title: string; hint: string; use: string; cancel: string; failed: string };

const FRAMES = 8;
const EDGE = 720;

// «🖼️ الغلاف», as on TikTok: a strip of frames from the video; slide along it, the frame under
// your finger shows big, and «استخدم هاي» makes it the cover (src/server/angles.ts setVideoCover).
// Only frames of the video itself: a picture from elsewhere would skip the content check.
export function CoverPicker({ angleId, videoUrl, labels, onSaved, onClose }: { angleId: string; videoUrl: string; labels: CoverLabels; onSaved: (preview: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [at, setAt] = useState(0);
  const [strip, setStrip] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // The strip: frames from start to end, read from a second, hidden copy of the video.
  useEffect(() => {
    let stop = false;
    const made: string[] = [];
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = videoUrl;
    const seek = (t: number) => new Promise<void>((resolve) => ((v.onseeked = () => resolve()), (v.currentTime = t)));
    v.onloadeddata = async () => {
      const d = v.duration;
      for (let i = 0; i < FRAMES && !stop; i++) {
        await seek(Math.min(d - 0.05, (d * (i + 0.5)) / FRAMES));
        const blob = await toJpeg(v, 96, Math.round((96 * v.videoHeight) / v.videoWidth) || 128, 0.6).catch(() => null);
        if (blob) made.push(URL.createObjectURL(blob));
        if (!stop) setStrip([...made]);
      }
    };
    return () => {
      stop = true;
      v.removeAttribute("src");
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [videoUrl]);

  function move(t: number) {
    setAt(t);
    if (video.current) video.current.currentTime = t;
  }

  async function save() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    setFailed(false);
    const scale = Math.min(1, EDGE / Math.max(v.videoWidth, v.videoHeight));
    try {
      const blob = await toJpeg(v, Math.round(v.videoWidth * scale), Math.round(v.videoHeight * scale), 0.85);
      const res = await fetch(`/api/angles/${angleId}/cover`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!res.ok) throw new Error(String(res.status));
      onSaved(URL.createObjectURL(blob));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={labels.title} className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 p-3">
        <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 font-bold">
          {labels.cancel}
        </button>
        <p className="font-extrabold">{labels.title}</p>
        <button type="button" onClick={save} disabled={busy || !duration} className="min-h-11 rounded-full bg-accent px-5 font-extrabold disabled:opacity-60">
          {busy ? "…" : labels.use}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <video
          ref={video}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            e.currentTarget.currentTime = Math.min(0.5, e.currentTarget.duration / 2);
            setAt(Math.min(0.5, e.currentTarget.duration / 2));
          }}
          className="max-h-full max-w-full rounded-2xl object-contain"
        />
      </div>
      <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-sm text-white/80">{failed ? labels.failed : labels.hint}</p>
        {/* The strip, with the slider laid over it: drag along to pick the frame. */}
        <div className="relative h-16 overflow-hidden rounded-xl bg-white/10" dir="ltr">
          <div className="flex h-full">
            {strip.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element -- frames made on this phone
              <img key={u} src={u} alt="" className="h-full min-w-0 flex-1 object-cover" />
            ))}
          </div>
          {duration > 0 && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" style={{ left: `${(at / duration) * 100}%` }} />
          )}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={at}
            onChange={(e) => move(Number(e.target.value))}
            aria-label={labels.title}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  );
}
