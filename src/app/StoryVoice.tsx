"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type StoryVoiceLabels = {
  lang: string; // "ar" or "en": the words come back in the language spoken; this is only a hint
  button: string; // «🎤 ما بدك تكتب؟ احكيها»
  again: string; // «🎤 احكي كمان»
  lock: string; // «🔒 صوتك ما بينسمع…»
  introTitle: string;
  intro: string[]; // the three steps
  introLock: string;
  introMic: string; // «رح يسألك جوالك…»
  introGo: string;
  listening: string; // the lock line while recording
  done: string;
  cancel: string;
  working: string;
  workingSub: string;
  ready: string; // «✓ هاي الكتابة من حكيك، وصوتك انمسح…»
  unclear: string;
  short: string;
  failed: string;
  noMic: string;
  questions: Record<string, string>; // by scene, with "other"
};

const noop = () => () => {};
const canRecord = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const INTRO_KEY = "zawmo-voice-intro";
const MAX_SECONDS = 60;
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

// «🎤 احكيها بصوتك» (his idea and «موافق», 27/11): speak about the shot instead of typing. What was
// said comes back as words in the story box (src/server/voice-note.ts); the sound is never kept or
// heard by anyone — said on the button, before the phone asks for the microphone (first time only),
// while recording, and when the words arrive, because people are shy of their own voice.
// Hidden where the phone can't record (no MediaRecorder).
export function StoryVoice({ angleId, labels, hasText, onText }: { angleId: string; labels: StoryVoiceLabels; hasText: boolean; onText: (text: string) => void }) {
  const able = useSyncExternalStore(noop, canRecord, () => false);
  const [state, setState] = useState<"idle" | "intro" | "recording" | "working" | "ready">("idle");
  const [problem, setProblem] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [scene, setScene] = useState("other");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Leaving (the sheet closed mid-recording): nothing is sent.
  useEffect(
    () => () => {
      cancelled.current = true;
      stopAll();
    },
    [],
  );

  function stopAll() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const r = recorder.current;
    if (r && r.state !== "inactive") r.stop();
    r?.stream.getTracks().forEach((t) => t.stop());
  }

  function tap() {
    setProblem("");
    let seen = false;
    try {
      seen = localStorage.getItem(INTRO_KEY) === "1";
    } catch {}
    if (seen) void start();
    else setState("intro");
  }

  async function start() {
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {}
    // The question fits what the shot shows (the scene, from the content check).
    fetch(`/api/angles/${angleId}/note`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { scene?: string } | null) => d?.scene && setScene(d.scene))
      .catch(() => {});
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("idle");
      setProblem(labels.noMic);
      return;
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    recorder.current = r;
    chunks.current = [];
    cancelled.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!cancelled.current) void send(new Blob(chunks.current, { type: r.mimeType || mimeType || "audio/webm" }));
    };
    r.start(1000);
    started.current = Date.now();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) finish();
    }, 250);
  }

  function finish() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (Date.now() - started.current < 1500) {
      cancelled.current = true;
      recorder.current?.stop();
      setState("idle");
      setProblem(labels.short);
      return;
    }
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    setState("working");
  }

  function cancel() {
    cancelled.current = true;
    stopAll();
    setState("idle");
  }

  async function send(blob: Blob) {
    setState("working");
    const res = await fetch(`/api/angles/${angleId}/note/voice?lang=${labels.lang === "en" ? "en" : "ar"}`, { method: "POST", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob }).catch(() => null);
    chunks.current = []; // the sound is dropped here too
    const d = res ? ((await res.json().catch(() => ({}))) as { text?: string; error?: string }) : {};
    if (res?.ok && d.text) {
      onText(d.text);
      setState("ready");
      return;
    }
    setState("idle");
    setProblem(d.error === "unclear" ? labels.unclear : labels.failed);
  }

  if (!able) return null;
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <>
      {state === "working" ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-background p-4 text-center" role="status">
          <span className="h-9 w-9 animate-spin rounded-full border-4 border-line border-t-secondary" aria-hidden />
          <span className="font-bold">{labels.working}</span>
          <span className="text-xs text-muted">{labels.workingSub}</span>
        </div>
      ) : (
        <>
          {state === "ready" && <span className="rounded-xl bg-secondary-soft px-3 py-2 text-xs font-bold text-secondary">{labels.ready}</span>}
          <button type="button" onClick={tap} className={`flex items-center justify-center gap-2 rounded-full font-bold ${hasText ? "min-h-10 w-fit bg-background px-4 text-sm text-secondary" : "min-h-12 bg-secondary px-4 text-white dark:text-background"}`}>
            {hasText ? labels.again : labels.button}
          </button>
          {!hasText && state !== "ready" && <span className="rounded-xl bg-secondary-soft px-3 py-2 text-xs font-bold leading-relaxed text-secondary">{labels.lock}</span>}
          {problem && (
            <span role="alert" className="text-sm font-semibold text-accent-ink">
              {problem}
            </span>
          )}
        </>
      )}

      {(state === "intro" || state === "recording") && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
          onClick={(e) => {
            e.stopPropagation(); // not the «✏️ تعديل» sheet's backdrop under it, which closes it
            if (state === "intro") setState("idle");
          }}
        >
          <div className="flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-background p-5 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {state === "intro" ? (
              <>
                <span className="text-lg font-bold">{labels.introTitle}</span>
                <ol className="flex list-none flex-col gap-2 p-0">
                  {labels.intro.map((line, i) => (
                    <li key={line} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 font-semibold">
                      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-secondary text-xs text-white dark:text-background">{i + 1}</span>
                      {line}
                    </li>
                  ))}
                </ol>
                <span className="rounded-xl bg-secondary-soft px-3 py-2 text-sm font-bold leading-relaxed text-secondary">{labels.introLock}</span>
                <span className="text-xs text-muted">{labels.introMic}</span>
                <button type="button" onClick={() => void start()} className="min-h-12 rounded-full bg-secondary font-bold text-white dark:text-background">
                  {labels.introGo}
                </button>
              </>
            ) : (
              <>
                <span className="rounded-2xl bg-surface px-3 py-2 text-center font-semibold">{labels.questions[scene] ?? labels.questions.other}</span>
                <span className="mx-auto mt-2 grid h-24 w-24 animate-pulse place-items-center rounded-full bg-accent text-4xl text-white ring-[12px] ring-accent-soft" aria-hidden>
                  🎤
                </span>
                <span className="text-center text-xl font-bold" aria-live="polite">
                  {mm} <span className="text-xs text-muted">/ 1:00</span>
                </span>
                <span className="rounded-xl bg-secondary-soft px-3 py-2 text-center text-xs font-bold text-secondary">{labels.listening}</span>
                <button type="button" onClick={finish} className="min-h-12 rounded-full bg-foreground font-bold text-background">
                  {labels.done}
                </button>
                <button type="button" onClick={cancel} className="min-h-10 rounded-full border border-line font-bold">
                  {labels.cancel}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
