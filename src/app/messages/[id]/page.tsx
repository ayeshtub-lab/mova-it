"use client";

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, BellOff, Check, CheckCheck, ImagePlus, Mic, MoreVertical, Pause, Play, Reply, Send, ShieldBan, SmilePlus, X } from "lucide-react";
import { Avatar, type Person } from "../Avatar";

type Card = { type: "angle" | "moment" | "invite"; title: string; image: string | null; href: string };
type Message = {
  id: string;
  body: string;
  mine: boolean;
  at: string;
  deleted?: boolean;
  voice?: string;
  seconds?: number | null;
  image?: string;
  w?: number | null;
  h?: number | null;
  card?: Card;
  reply?: { id: string; body: string; mine: boolean };
  reactions: { emoji: string; count: number; mine: boolean }[];
  unsend?: boolean; // (worked out when its actions open: still within the 15 minutes)
};
type Chat = { id: string; other: Person; online: boolean; typing: boolean; blocked: boolean; muted: boolean; request: boolean; otherSeenAt: string | null; more: boolean; messages: Message[] };

const EMOJIS = ["😀", "😂", "❤️", "😍", "🔥", "👍", "😎", "🙏", "✨", "🎉", "😢", "🤔", "👌", "💯", "🌹", "☕"];
const REACTIONS = ["❤️", "😂", "👏", "😮", "😢", "🙏"];
// While the conversation is on screen; never while the tab is hidden (the server is kept light).
const POLL_MS = 4000;
// «🎤»: up to two minutes (src/server/conversations.ts MAX_VOICE_SECONDS).
const VOICE_MAX = 120;
const UNSEND_MS = 15 * 60 * 1000;

const time = (at: string) => new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" }).format(new Date(at));
const day = (at: string) => new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", numberingSystem: "latn" }).format(new Date(at));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// What this phone records: Opus in WebM (Android, Chrome), else MP4/AAC (iPhone).
const voiceType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";

// A message with whether its sender may still delete it for both (when its actions open).
const withUnsend = (m: Message): Message => ({ ...m, unsend: m.mine && Date.now() - new Date(m.at).getTime() < UNSEND_MS });

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

// A photo from the phone, made smaller (1600 px at most) as a JPEG before it goes.
async function shrink(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? { blob, width: canvas.width, height: canvas.height } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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

// A shot or moment sent from Zawmo — or «ضيف زاويتك» — as a card that opens it.
function CardView({ card, mine }: { card: Card; mine: boolean }) {
  return (
    <Link href={card.href} className="block w-56 max-w-full overflow-hidden rounded-xl bg-black/5">
      {card.image && (
        // eslint-disable-next-line @next/next/no-img-element -- the shot's picture
        <img src={card.image} alt="" className="aspect-[4/5] w-full object-cover" />
      )}
      <span className="flex flex-col gap-1 p-2">
        <span className="line-clamp-2 text-sm font-bold">{card.title}</span>
        <span className={`rounded-full px-3 py-1 text-center text-xs font-extrabold ${mine ? "bg-white/25" : "bg-accent text-white"}`}>{card.type === "invite" ? "＋ أضف زاويتك" : "▶︎ شاهد"}</span>
      </span>
    </Link>
  );
}

// One conversation (src/server/conversations.ts): the newest messages at the bottom (older ones as
// you scroll up), a box to write in with photos, voice and emoji. A long press (or right click) on
// a message: react, answer, copy, delete, report. ✓ sent, ✓✓ read. A request waits for «قبول».
export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const [acting, setActing] = useState<Message | null>(null);
  const [replying, setReplying] = useState<Message | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const lastId = useRef<string | null>(null);
  // Go to the newest message once the next messages are on screen: on opening, after sending, and
  // when something new comes while reading the end (never when scrolled up to read older ones).
  const stick = useRef(true);
  // Older messages put above: the reading place stays where it was.
  const keepFrom = useRef<number | null>(null);
  const typedAt = useRef(0);
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
    if (lastId.current && newest && newest.id !== lastId.current && !newest.mine) ding();
    const list = listRef.current;
    const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (newest?.id !== lastId.current && nearBottom) stick.current = true;
    lastId.current = newest?.id ?? null;
    // (older messages already loaded stay above the newest ones)
    setChat((was) => {
      const first = data.messages[0]?.at;
      const older = was && first ? was.messages.filter((m) => m.at < first) : [];
      return { ...data, more: older.length ? was!.more : data.more, messages: [...older, ...data.messages] };
    });
  }, [id, router]);

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

  const firstId = chat?.messages[0]?.id;
  const count = chat?.messages.length ?? 0;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !count) return;
    if (keepFrom.current !== null) {
      list.scrollTop = list.scrollHeight - keepFrom.current;
      keepFrom.current = null;
      return;
    }
    if (!stick.current) return;
    list.scrollTop = list.scrollHeight;
    stick.current = false;
  }, [count, firstId]);

  // Scrolled to the top: the 50 before.
  async function older() {
    if (!chat?.more || loadingOlder || !firstId) return;
    setLoadingOlder(true);
    const res = await fetch(`/api/conversations/${id}/messages?before=${firstId}`).catch(() => null);
    setLoadingOlder(false);
    if (!res?.ok) return;
    const data = (await res.json()) as Chat;
    keepFrom.current = listRef.current ? listRef.current.scrollHeight - listRef.current.scrollTop : null;
    setChat((c) => (c ? { ...c, more: data.more, messages: [...data.messages.filter((m) => !c.messages.some((x) => x.id === m.id)), ...c.messages] } : c));
  }

  function added(message: Message) {
    lastId.current = message.id;
    stick.current = true;
    setChat((c) => (c ? { ...c, request: false, messages: [...c.messages, message] } : c));
    setReplying(null);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending || !chat) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/conversations/${id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text, replyTo: replying?.id }) }).catch(() => null);
    setSending(false);
    if (res?.ok) {
      added((await res.json()) as Message);
      setInput("");
      setShowEmoji(false);
      return;
    }
    setError(res?.status === 403 ? "ما بتقدر تراسل هالشخص." : res?.status === 429 ? "رسائل كثير بوقت قصير، ارتاح شوي وارجع." : res?.status === 400 ? "الرسالة طويلة كتير (١٠٠٠ حرف بالأكثر)." : "ما انبعتت الرسالة، جرّب مرة تانية.");
  }

  // «عم يكتب…»: told every 3 seconds at most while typing.
  function typing(text: string) {
    setInput(text);
    if (text && Date.now() - typedAt.current > 3000) {
      typedAt.current = Date.now();
      fetch(`/api/conversations/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "typing" }) }).catch(() => {});
    }
  }

  async function sendPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSending(true);
    const small = await shrink(file);
    if (!small) {
      setSending(false);
      return setError("ما قدرنا نفتح الصورة، جرّب وحدة تانية.");
    }
    const form = new FormData();
    form.append("image", small.blob, "photo.jpg");
    form.append("width", String(small.width));
    form.append("height", String(small.height));
    if (replying) form.append("replyTo", replying.id);
    const res = await fetch(`/api/conversations/${id}/photo`, { method: "POST", body: form }).catch(() => null);
    setSending(false);
    if (res?.ok) added((await res.json()) as Message);
    else setError("ما انبعتت الصورة، جرّب مرة تانية.");
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
    const reply = replying?.id;
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      setRecording(null);
      if (!keep.current) return;
      const blob = new Blob(chunks.current, { type: rec.mimeType.split(";")[0] || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, `voice.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
      form.append("seconds", String(Math.min(seconds, VOICE_MAX)));
      if (reply) form.append("replyTo", reply);
      setSending(true);
      const res = await fetch(`/api/conversations/${id}/voice`, { method: "POST", body: form }).catch(() => null);
      setSending(false);
      if (res?.ok) added((await res.json()) as Message);
      else setError(res?.status === 400 ? "التسجيل قصير كتير أو طويل كتير." : "ما انبعتت الرسالة الصوتية، جرّب مرة تانية.");
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

  // Around one message (react, delete, report); the conversation itself (mute, accept, block).
  async function onMessage(m: Message, body: Record<string, unknown>) {
    setActing(null);
    const res = await fetch(`/api/conversations/${id}/messages/${m.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.status === 409) setError("فات الوقت: بتقدر تحذفها عند الكل خلال ربع ساعة من إرسالها.");
    else if (res?.ok && body.action === "report") setError("✓ وصل بلاغك لفريق زاومو، شكرًا.");
    if (body.action === "delete" && !body.forAll && res?.ok) setChat((c) => (c ? { ...c, messages: c.messages.filter((x) => x.id !== m.id) } : c));
    else load();
  }
  async function onChat(action: "mute" | "unmute" | "accept" | "block") {
    setMenu(false);
    if (action === "block" && !confirm(`حظر ${chat?.other.displayName}؟ ما رح تشوفوا بعض ولا تراسلوا بعض.`)) return;
    await fetch(`/api/conversations/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    if (action === "block") return router.push("/messages");
    load();
  }

  // Long press on a message (or right click): its actions.
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = (m: Message) => !m.deleted && setActing(withUnsend(m));
  const holdProps = (m: Message) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      open(m);
    },
    onTouchStart: () => {
      press.current = setTimeout(() => open(m), 450);
    },
    onTouchEnd: () => {
      if (press.current) clearTimeout(press.current);
    },
    onTouchMove: () => {
      if (press.current) clearTimeout(press.current);
    },
  });

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
      <header className="relative flex shrink-0 items-center gap-3 border-b border-line bg-background px-3 py-2.5">
        <Link href="/messages" aria-label="المحادثات" className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <ArrowRight size={24} />
        </Link>
        <Link href={`/u/${chat.other.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar person={chat.other} online={chat.online} />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1 truncate text-lg font-extrabold">
              {chat.other.displayName}
              {chat.muted && <BellOff size={14} className="text-muted" aria-label="مكتومة" />}
            </span>
            <span className={`text-xs font-semibold ${chat.typing || chat.online ? "text-green-600" : "text-muted"}`}>{chat.typing ? "عم يكتب…" : chat.online ? "نشط الآن" : "غير متصل"}</span>
          </span>
        </Link>
        <button type="button" onClick={() => setMenu((v) => !v)} aria-label="خيارات" className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <MoreVertical size={22} />
        </button>
        {menu && (
          <div className="absolute end-3 top-full z-30 mt-1 flex w-56 flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-xl">
            <button type="button" onClick={() => onChat(chat.muted ? "unmute" : "mute")} className="flex min-h-12 items-center gap-3 px-4 text-start font-bold hover:bg-surface">
              {chat.muted ? <Bell size={18} /> : <BellOff size={18} />}
              {chat.muted ? "رجّع الإشعارات" : "كتم المحادثة"}
            </button>
            <button type="button" onClick={() => onChat("block")} className="flex min-h-12 items-center gap-3 px-4 text-start font-bold text-accent-ink hover:bg-surface">
              <ShieldBan size={18} />
              حظر {chat.other.displayName}
            </button>
          </div>
        )}
      </header>

      {chat.request && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-secondary-soft px-4 py-3 text-sm">
          <p className="font-bold">📩 {chat.other.displayName} مش من معارفك. بدك تقبل المراسلة؟</p>
          <p className="text-xs text-muted">ما بيعرف إنك شفت رسالته لحد ما تقبل أو ترد.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChat("accept")} className="min-h-10 flex-1 rounded-full bg-accent font-bold text-white">
              قبول
            </button>
            <button type="button" onClick={() => onChat("block")} className="min-h-10 flex-1 rounded-full border border-line font-bold">
              حظر
            </button>
          </div>
        </div>
      )}

      <div ref={listRef} onScroll={(e) => e.currentTarget.scrollTop < 80 && older()} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.more && <p className="text-center text-xs text-muted">{loadingOlder ? "عم نجيب الأقدم…" : "اطلع لفوق للرسائل الأقدم"}</p>}
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
            <div key={m.id} id={`msg-${m.id}`}>
              {newDay && <p className="my-3 text-center text-xs font-bold text-muted">{day(m.at)}</p>}
              <div className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                <div {...holdProps(m)} className={`relative max-w-[80%] select-none rounded-2xl px-3 py-2 shadow-sm sm:select-text ${m.deleted ? "border border-dashed border-line bg-transparent text-muted" : m.mine ? "rounded-ee-md bg-accent text-white" : "rounded-es-md bg-surface"}`}>
                  {m.deleted ? (
                    <p className="text-sm italic">🚫 انحذفت هالرسالة</p>
                  ) : (
                    <>
                      {m.reply && (
                        <a href={`#msg-${m.reply.id}`} className={`mb-1 block rounded-lg border-s-4 px-2 py-1 text-xs ${m.mine ? "border-white/70 bg-white/15" : "border-accent bg-background/70"}`}>
                          <span className="block font-bold">{m.reply.mine ? "أنت" : chat.other.displayName}</span>
                          <span className="line-clamp-2">{m.reply.body}</span>
                        </a>
                      )}
                      {m.card ? (
                        <CardView card={m.card} mine={m.mine} />
                      ) : m.image ? (
                        <a href={m.image} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a checked link */}
                          <img src={m.image} alt="صورة" loading="lazy" className="max-h-80 w-56 max-w-full rounded-xl object-cover" style={m.w && m.h ? { aspectRatio: `${m.w} / ${m.h}` } : undefined} />
                        </a>
                      ) : m.voice ? (
                        <Voice src={m.voice} seconds={m.seconds} mine={m.mine} />
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                      )}
                    </>
                  )}
                  <span className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${m.deleted ? "" : m.mine ? "text-white/80" : "text-muted"}`}>
                    {time(m.at)}
                    {m.mine && !m.deleted && (new Date(m.at).getTime() <= seen ? <CheckCheck size={14} aria-label="انقرأت" /> : <Check size={14} aria-label="انبعتت" />)}
                  </span>
                </div>
                {m.reactions.length > 0 && (
                  <span className="-mt-1.5 flex gap-0.5 rounded-full border border-line bg-background px-1.5 py-0.5 text-sm shadow-sm">
                    {m.reactions.map((r) => (
                      <span key={r.emoji}>
                        {r.emoji}
                        {r.count > 1 && <span className="text-[10px]">{r.count}</span>}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* A message's actions: a quick reaction, answer, copy, delete, report. */}
      {acting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => setActing(null)}>
          <div role="dialog" aria-label="خيارات الرسالة" onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col gap-1 rounded-3xl bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex justify-around pb-2">
              {REACTIONS.map((e) => (
                <button key={e} type="button" onClick={() => onMessage(acting, { action: "react", emoji: e })} className={`rounded-full p-2 text-3xl transition-transform active:scale-90 ${acting.reactions.some((r) => r.mine && r.emoji === e) ? "bg-accent-soft" : ""}`}>
                  {e}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setReplying(acting);
                setActing(null);
              }}
              className="flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold hover:bg-surface"
            >
              <Reply size={18} /> ردّ
            </button>
            {!acting.voice && !acting.image && !acting.card && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(acting.body).catch(() => {});
                  setActing(null);
                }}
                className="flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold hover:bg-surface"
              >
                📋 نسخ
              </button>
            )}
            <button type="button" onClick={() => onMessage(acting, { action: "delete", forAll: false })} className="flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold hover:bg-surface">
              🗑️ حذف عندي
            </button>
            {acting.unsend && (
              <button type="button" onClick={() => onMessage(acting, { action: "delete", forAll: true })} className="flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold text-accent-ink hover:bg-surface">
                🗑️ حذف عند الكل
              </button>
            )}
            {!acting.mine && (
              <button type="button" onClick={() => onMessage(acting, { action: "report", reason: "OFFENSIVE" })} className="flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold text-accent-ink hover:bg-surface">
                🚩 تبليغ عن الرسالة
              </button>
            )}
          </div>
        </div>
      )}

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
            {replying && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border-s-4 border-accent bg-background px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-accent-ink">ردّ على {replying.mine ? "رسالتك" : chat.other.displayName}</span>
                  <span className="line-clamp-1 text-muted">{replying.body}</span>
                </span>
                <button type="button" onClick={() => setReplying(null)} aria-label="إلغاء الرد" className="flex size-8 items-center justify-center rounded-full hover:bg-surface">
                  <X size={16} />
                </button>
              </div>
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
              <form onSubmit={send} className="flex items-center gap-1.5">
                <button type="button" onClick={() => setShowEmoji((v) => !v)} aria-label="إيموجي" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
                  <SmilePlus size={22} />
                </button>
                <button type="button" onClick={() => photoRef.current?.click()} aria-label="صورة" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
                  <ImagePlus size={22} />
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    sendPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  value={input}
                  onChange={(e) => typing(e.target.value)}
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
