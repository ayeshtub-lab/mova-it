"use client";

import { useEffect, useRef, useState } from "react";

export type OwnSoundLabels = {
  add: string;
  title: string;
  hint: string;
  record: string;
  recording: string;
  stop: string;
  again: string;
  upload: string;
  ready: string;
  name: string;
  shared: string;
  private: string;
  submit: string;
  checking: string;
  added: string;
  blocked: string;
  tooBig: string;
  micDenied: string;
  membersOnly: string;
  privateTag: string;
  mineTag: string;
  chooseFirst?: string;
};
export type WhyLabels = { whyCopyright: string; whyMusic: string; whyOffensive: string; whyFailed: string; whyNoAudio: string };

const MAX_SECONDS = 40;
const MAX_BYTES = 4_000_000;
// What this phone records in (Safari: mp4; the rest: webm/ogg).
const recorderType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));

// «➕ أضف صوتك» (from the sound picker): record with the microphone (40 s at most) or pick a sound
// file, name it if you like, choose «👥 للكل» or «🔒 خاص», and send it — it is checked (rights,
// content) before it can be used. On success the picker selects it.
export function AddSound({ labels, why, onAdded, onClose }: { labels: OwnSoundLabels; why: WhyLabels; onAdded: (sound: { key: string; name: string; shared: boolean }) => void; onClose: () => void }) {
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number | null } | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Leaving: the microphone is let go and the preview freed.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);

  async function startRecording() {
    setMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setMessage(labels.micDenied);
    }
    const type = recorderType();
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const parts: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      const blob = new Blob(parts, { type: rec.mimeType || type || "audio/webm" });
      setClip({ blob, url: URL.createObjectURL(blob), seconds: Math.min(MAX_SECONDS, Math.round((Date.now() - started) / 100) / 10) });
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setElapsed(0);
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS && rec.state === "recording") rec.stop();
    }, 250);
  }

  function pickFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setMessage(labels.tooBig);
    const url = URL.createObjectURL(file);
    setClip({ blob: file, url, seconds: null });
    // Its length, for the «ready» line (the server cuts it to 40 s anyway).
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => setClip((c) => (c?.url === url && Number.isFinite(probe.duration) ? { ...c, seconds: Math.min(MAX_SECONDS, Math.round(probe.duration * 10) / 10) } : c));
    probe.src = url;
  }

  async function submit() {
    if (!clip) return;
    setBusy(true);
    setMessage(labels.checking);
    const form = new FormData();
    form.set("file", clip.blob, "sound");
    form.set("name", name);
    form.set("shared", String(shared));
    const res = await fetch("/api/sounds", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { key?: string; name?: string; status?: string; reason?: string; shared?: boolean; error?: string } | null;
    setBusy(false);
    const reasons: Record<string, string> = { copyright: why.whyCopyright, music: why.whyMusic, offensive: why.whyOffensive, no_audio: why.whyNoAudio, too_big: labels.tooBig, members_only: labels.membersOnly };
    if (body?.status === "public" && body.key) {
      setMessage(labels.added.replace("{name}", body.name ?? ""));
      return onAdded({ key: body.key, name: body.name ?? "", shared: body.shared !== false });
    }
    const code = body?.reason ?? body?.error ?? "";
    setMessage(code === "members_only" || code === "too_big" ? reasons[code] : labels.blocked.replace("{why}", reasons[code] ?? why.whyFailed));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={busy ? undefined : onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{labels.title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="✕" className="flex size-10 items-center justify-center rounded-full hover:bg-surface disabled:opacity-40">
            <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <p className="text-sm leading-relaxed text-muted">{labels.hint}</p>

        {!clip && (
          <div className="flex flex-col gap-2">
            {recording ? (
              <button type="button" onClick={() => recorder.current?.stop()} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-5 font-extrabold text-white">
                <span className="size-3 animate-pulse rounded-full bg-white" />
                {labels.recording.replace("{s}", String(elapsed))} · {labels.stop}
              </button>
            ) : (
              <button type="button" onClick={startRecording} className="min-h-14 rounded-full bg-accent px-5 font-extrabold text-white">
                {labels.record}
              </button>
            )}
            {!recording && (
              <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-line px-5 font-bold hover:bg-surface">
                {labels.upload}
                <input type="file" accept="audio/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
              </label>
            )}
          </div>
        )}

        {clip && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-secondary">{labels.ready.replace("{s}", clip.seconds != null ? String(clip.seconds) : "…")}</p>
            <audio src={clip.url} controls className="w-full" />
            <button type="button" disabled={busy} onClick={() => setClip(null)} className="self-start text-sm font-bold text-muted underline-offset-4 hover:underline disabled:opacity-50">
              {labels.again}
            </button>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder={labels.name} aria-label={labels.name} className="min-h-12 rounded-2xl border border-line bg-surface px-4 outline-none focus:border-accent" />
            <div role="radiogroup" className="flex flex-col gap-2">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={shared === value}
                  onClick={() => setShared(value)}
                  className={`min-h-12 rounded-2xl border-2 px-4 text-start text-sm font-bold ${shared === value ? (value ? "border-accent bg-accent-soft/40" : "border-violet-500 bg-violet-500/10") : "border-line"}`}
                >
                  {value ? labels.shared : labels.private}
                </button>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={submit} className="min-h-12 rounded-full bg-accent px-5 font-extrabold text-white disabled:opacity-60">
              {busy ? labels.checking : labels.submit}
            </button>
          </div>
        )}

        {message && (
          <p role="status" className="text-sm font-semibold">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
