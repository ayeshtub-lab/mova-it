"use client";

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CheckCheck, Mic, Pause, Play, Send, SmilePlus, X } from "lucide-react";
import { Avatar, type Person } from "../Avatar";

type Message = { id: string; body: string; mine: boolean; at: string; voice?: string; seconds?: number | null };
type Chat = { id: string; other: Person; online: boolean; blocked: boolean; otherSeenAt: string | null; messages: Message[] };

const EMOJIS = ["😀", "😂", "❤️", "😍", "🔥", "👍", "😎", "🙏", "✨", "🎉", "😢", "🤔", "👌", "💯", "🌹", "☕"];
// While the conversation is on screen; never while the tab is hidden (the server is kept light).
const POLL_MS = 4000;
// «🎤»: up to two minutes (src/server/conversations.ts MAX_VOICE_SECONDS).
const VOICE_MAX = 120;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// What this phone records: Opus in WebM (Android, Chrome), else MP4/AAC (iPhone).
const voiceType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";

// A voice message in its bubble: play / pause, how far it has played, how long it is.
function Voice({ src, seconds, mine }: { src: string; seconds: number | null | undefined; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const total = seconds ?? 0;
  return (
    <span className="flex w-56 max-w-full items-center gap-2" dir="ltr">
      <button
        type="button"
        aria-label={playing ? "إيقاف" : "تشغيل"}
        onClick={() => (playing ? audio.current?.pause() : audio.current?.play().catch(() => {}))}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${mine ? "bg-white/25" : "bg-accent text-white"}`}
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-px" />}
      </button>
      <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${mine ? "bg-white/30" : "bg-line"}`}>
        <span className={`block h-full ${mine ? "bg-white" : "bg-accent"}`} style={{ width: total ? `${Math.min(100, (at / total) * 100)}%` : "0%" }} />
      </span>
      <span className="w-9 shrink-0 text-xs tabular-nums">{clock(playing || at ? at : total)}</span>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setAt(0);
        }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
      />
    </span>
  );
}

const time = (at: string) => new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" }).format(new Date(at));
const day = (at: string) => new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", numberingSystem: "latn" }).format(new Date(at));

// A short, soft sound for a message that just came in (only when the page is open).
function ding() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

// One conversation (src/server/conversations.ts): the latest messages, the newest at the bottom, a
// box to write in. ✓ sent, ✓✓ once the other person has opened the conversation since.
export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);
  // Go to the newest message once the next messages are on screen: on opening, after sending, and
  // when something new comes while reading the end (never when scrolled up to read older ones).
  const stick = useRef(true);
  const [recording, setRecording] = useState<{ started: number; seconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/conversations/${id}/messages`, { cache: "no-store" }).catch(() => null);
    if (!res) return;
    if (res.status === 401) return router.push("/");
    if (res.status === 404) return router.push("/messages");
    if (!res.ok) return;
    const data = (await res.json()) as Chat;
    // Opened for the first time with something new in it: the number on «الدردشة» (drawn by the
    // layout on the server) goes down now.
    if (lastId.current === null && data.messages.some((m) => !m.mine)) router.refresh();
    const newest = data.messages.at(-1);
    // Something new from them since the last look: a soft sound.
    if (lastId.current && newest && newest.id !== lastId.current && !newest.mine) ding();
    const list = listRef.current;
    const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (newest?.id !== lastId.current && nearBottom) stick.current = true;
    lastId.current = newest?.id ?? null;
    setChat(data);
  }, [id, router]);

  // The recording's clock — and at two minutes it is sent by itself.
  const recordingStarted = recording?.started ?? null;
  useEffect(() => {
    if (!recordingStarted) return;
    const tick = setInterval(() => {
      const seconds = Math.floor((Date.now() - recordingStarted) / 1000);
      if (seconds >= VOICE_MAX) {
        keep.current = true;
        recorder.current?.stop();
      } else setRecording((r) => (r ? { ...r, seconds } : r));
    }, 500);
    return () => clearInterval(tick);
  }, [recordingStarted]);

  const count = chat?.messages.length ?? 0;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !stick.current || !count) return;
    list.scrollTop = list.scrollHeight;
    stick.current = false;
  }, [count]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer && document.visibilityState === "visible") timer = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? (load(), start()) : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending || !chat) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/conversations/${id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => null);
    setSending(false);
    if (res?.ok) {
      const message = (await res.json()) as Message;
      lastId.current = message.id;
      stick.current = true;
      setChat((c) => (c ? { ...c, messages: [...c.messages, message] } : c));
      setInput("");
      setShowEmoji(false);
      return;
    }
    setError(res?.status === 403 ? "ما بتقدر تراسل هالشخص." : res?.status === 429 ? "رسائل كثير بوقت قصير، ارتاح شوي وارجع." : res?.status === 400 ? "الرسالة طويلة كتير (١٠٠٠ حرف بالأكثر)." : "ما انبعتت الرسالة، جرّب مرة تانية.");
  }

  // «🎤»: recording starts at once; ✕ throws it away, ➤ sends it (at two minutes it sends itself).
  async function startRecording() {
    setError(null);
    const type = voiceType();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setError("اسمح لزاومو يستعمل المايك من إعدادات المتصفح، وجرّب مرة تانية.");
    }
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      setRecording(null);
      if (!keep.current) return;
      const blob = new Blob(chunks.current, { type: rec.mimeType.split(";")[0] || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, `voice.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
      form.append("seconds", String(Math.min(seconds, VOICE_MAX)));
      setSending(true);
      const res = await fetch(`/api/conversations/${id}/voice`, { method: "POST", body: form }).catch(() => null);
      setSending(false);
      if (res?.ok) {
        const message = (await res.json()) as Message;
        lastId.current = message.id;
        stick.current = true;
        setChat((c) => (c ? { ...c, messages: [...c.messages, message] } : c));
      } else setError(res?.status === 400 ? "التسجيل قصير كتير أو طويل كتير." : "ما انبعتت الرسالة الصوتية، جرّب مرة تانية.");
    };
    const started = Date.now();
    recorder.current = rec;
    rec.start(1000);
    setRecording({ started, seconds: 0 });
  }
  function stopRecording(send: boolean) {
    keep.current = send;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  if (!chat) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <span aria-label="جاري التحميل" className="size-10 animate-spin rounded-full border-4 border-line border-t-accent" />
      </div>
    );
  }

  const seen = chat.otherSeenAt ? new Date(chat.otherSeenAt).getTime() : 0;
  return (
    // The screen's height (dvh: a phone's browser bars included), with room under it for the
    // bottom bar on phones — so the box to write in is always in sight above it.
    <div className="flex h-[100dvh] w-full flex-col bg-background pb-[calc(5.25rem+env(safe-area-inset-bottom))] text-foreground sm:pb-0">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-background px-3 py-2.5">
        <Link href="/messages" aria-label="المحادثات" className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <ArrowRight size={24} />
        </Link>
        <Link href={`/u/${chat.other.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar person={chat.other} online={chat.online} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-extrabold">{chat.other.displayName}</span>
            <span className={`text-xs font-semibold ${chat.online ? "text-green-600" : "text-muted"}`}>{chat.online ? "نشط الآن" : "غير متصل"}</span>
          </span>
        </Link>
      </header>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
            <span className="text-6xl opacity-40">💬</span>
            <p className="font-bold">ابدأ المحادثة مع {chat.other.displayName}</p>
          </div>
        )}
        {chat.messages.map((m, i) => {
          const prev = chat.messages[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          return (
            <div key={m.id}>
              {newDay && <p className="my-3 text-center text-xs font-bold text-muted">{day(m.at)}</p>}
              <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${m.mine ? "rounded-ee-md bg-accent text-white" : "rounded-es-md bg-surface"}`}>
                  {m.voice ? <Voice src={m.voice} seconds={m.seconds} mine={m.mine} /> : <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
                  <span className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${m.mine ? "text-white/80" : "text-muted"}`}>
                    {time(m.at)}
                    {m.mine && (new Date(m.at).getTime() <= seen ? <CheckCheck size={14} aria-label="انقرأت" /> : <Check size={14} aria-label="انبعتت" />)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-line bg-surface/60 px-3 py-2">
        {chat.blocked ? (
          <p className="py-2 text-center text-sm font-bold text-muted">ما بتقدر تراسل هالشخص.</p>
        ) : (
          <>
            {error && (
              <p role="alert" className="pb-2 text-center text-sm font-bold text-accent-ink">
                {error}
              </p>
            )}
            {showEmoji && (
              <div className="mb-2 grid grid-cols-8 gap-1 rounded-2xl border border-line bg-background p-2">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setInput((t) => t + e)} className="rounded-lg p-1.5 text-2xl hover:bg-surface">
                    {e}
                  </button>
                ))}
              </div>
            )}
            {recording ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => stopRecording(false)} aria-label="إلغاء التسجيل" className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
                  <X size={22} />
                </button>
                <span className="flex min-h-11 flex-1 items-center gap-2 rounded-full bg-background px-4 font-bold">
                  <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-red-500" />
                  عم بسجّل… <span className="tabular-nums">{clock(recording.seconds)}</span>
                </span>
                <button type="button" onClick={() => stopRecording(true)} aria-label="إرسال التسجيل" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Send size={20} className="-scale-x-100" />
                </button>
              </div>
            ) : (
            <form onSubmit={send} className="flex items-center gap-2">
              <button type="button" onClick={() => setShowEmoji((v) => !v)} aria-label="إيموجي" className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
                <SmilePlus size={22} />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder="اكتب رسالة…"
                enterKeyHint="send"
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-background px-4 text-base outline-none focus:border-accent"
              />
              {/* Nothing written: the mic (like WhatsApp); something written: send. */}
              {!input.trim() && !sending && typeof MediaRecorder !== "undefined" ? (
                <button type="button" onClick={startRecording} aria-label="رسالة صوتية" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Mic size={20} />
                </button>
              ) : (
                <button type="submit" disabled={sending || !input.trim()} aria-label="إرسال" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40">
                  {sending ? <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send size={20} className="-scale-x-100" />}
                </button>
              )}
            </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
