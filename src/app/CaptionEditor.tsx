"use client";

import { useEffect, useRef, useState } from "react";
import { CAPTION_COLOURS, CAPTION_MAX, CAPTION_Y, captionStyle, type CaptionView } from "@/lib/caption";

export type CaptionLabels = {
  title: string;
  placeholder: string;
  emoji: string;
  color: string;
  background: string;
  size: string;
  sizes: string[];
  drag: string;
  save: string;
  remove: string;
  cancel: string;
  failed: string;
  blocked: string;
  checkFailed: string;
};

const FRAME = 1080; // the 9:16 frame the writing is drawn for (1080×1920)
const EMOJI = ["😍", "😂", "🔥", "❤️", "🤗", "😎", "🤩", "👏", "🙌", "💯", "✨", "🌅", "🌙", "☀️", "🌊", "🌴", "☕", "🍰", "🎉", "🎂", "⚽", "📸", "🎶", "🕌", "🤲", "💪", "😅", "🥳", "💙", "💛"];
const COLORS = CAPTION_COLOURS;
const SIZES = [54, 72, 96];
const isArabic = (s: string) => /[؀-ۿ]/.test(s);
// Text on a coloured pill: dark on light colours, white on the rest.
const onColour = (hex: string) => (["#ffffff", "#ffbf1f", "#ff7eb6"].includes(hex) ? "#1f1a17" : "#ffffff");

// Draws the writing into a transparent canvas: lines wrapped to the frame, centred,
// right-to-left for Arabic; either on a rounded pill or with a soft shadow to read on
// any picture. Emoji come from the phone's own emoji font.
function draw(canvas: HTMLCanvasElement, text: string, colour: string, pill: boolean, size: number) {
  const ctx = canvas.getContext("2d")!;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const font = `800 ${size}px ${family}`;
  ctx.font = font;
  const maxWidth = FRAME * 0.84;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const lineHeight = Math.round(size * 1.4);
  const padX = pill ? Math.round(size * 0.6) : Math.round(size * 0.3);
  const padY = pill ? Math.round(size * 0.35) : Math.round(size * 0.3);
  const width = Math.min(FRAME, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width), size)) + padX * 2);
  const height = lines.length * lineHeight + padY * 2;
  canvas.width = width;
  canvas.height = height;

  // (Resizing the canvas resets the context.)
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = isArabic(text) ? "rtl" : "ltr";
  if (pill) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, Math.min(height / 2, size * 0.7));
    ctx.fill();
    ctx.fillStyle = onColour(colour);
  } else {
    ctx.shadowColor = colour === "#1f1a17" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)";
    ctx.shadowBlur = size * 0.25;
    ctx.shadowOffsetY = size * 0.04;
    ctx.fillStyle = colour;
  }
  lines.forEach((l, i) => ctx.fillText(l, width / 2, padY + lineHeight * (i + 0.5)));
}

// «✍️ كتابة على اللقطة»: text with emoji, a colour, on a pill or not, three sizes, dragged
// up or down on a 9:16 preview. The preview IS the image that gets saved.
export function CaptionEditor({
  angleId,
  imageUrl,
  filter,
  initial,
  labels,
  onSaved,
  onClose,
}: {
  angleId: string;
  imageUrl: string | null;
  filter?: string;
  initial: CaptionView | null;
  labels: CaptionLabels;
  onSaved: (caption: CaptionView | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [colour, setColour] = useState(initial?.style?.colour ?? COLORS[0]);
  const [pill, setPill] = useState(initial?.style?.pill ?? true);
  const [size, setSize] = useState(initial?.style?.size ?? 1);
  const [y, setY] = useState(initial?.y ?? 0.5);
  const [preview, setPreview] = useState<{ src: string; w: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Redraw on every change (after the site's font has loaded).
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      if (!text.trim()) return setPreview(null);
      canvas.current ??= document.createElement("canvas");
      draw(canvas.current, text.trim(), colour, pill, SIZES[size]);
      setPreview({ src: canvas.current.toDataURL("image/png"), w: canvas.current.width / FRAME });
    });
    return () => {
      cancelled = true;
    };
  }, [text, colour, pill, size]);

  function moveTo(clientY: number) {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setY(Math.min(CAPTION_Y.max, Math.max(CAPTION_Y.min, (clientY - box.top) / box.height)));
  }

  async function save() {
    if (!text.trim() || !canvas.current || !preview) return;
    setBusy(true);
    setError(null);
    const image = await new Promise<Blob | null>((resolve) => canvas.current!.toBlob(resolve, "image/png"));
    const form = new FormData();
    form.set("image", image!, "caption.png");
    form.set("text", text.trim());
    form.set("y", String(y));
    form.set("w", String(Math.min(1, preview.w)));
    form.set("style", JSON.stringify({ colour, pill, size }));
    const res = await fetch(`/api/angles/${angleId}/caption`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const code = res ? (await res.json().catch(() => ({}))).error : null;
      return setError(code === "blocked" ? labels.blocked : code === "check_failed" ? labels.checkFailed : labels.failed);
    }
    onSaved((await res.json()).caption);
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/angles/${angleId}/caption`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(labels.failed);
    onSaved(null);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{labels.title}</h2>
          <button type="button" onClick={onClose} aria-label={labels.cancel} className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
            <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {/* The shot on a 9:16 frame, the writing where it will be: drag it up or down. */}
        <div
          ref={frame}
          className="relative mx-auto aspect-[9/16] w-44 shrink-0 touch-none select-none overflow-hidden rounded-2xl bg-black sm:w-52"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            moveTo(e.clientY);
          }}
          onPointerMove={(e) => dragging.current && moveTo(e.clientY)}
          onPointerUp={() => (dragging.current = false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL or local preview */}
          {imageUrl && <img src={imageUrl} alt="" draggable={false} className="size-full object-cover" style={{ filter }} />}
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- the canvas drawing itself
            <img src={preview.src} alt="" draggable={false} className="pointer-events-none absolute" style={captionStyle({ y, w: Math.min(1, preview.w) })} />
          )}
        </div>
        <p className="-mt-1 text-center text-xs text-muted">{labels.drag}</p>

        <textarea
          value={text}
          onChange={(e) => setText([...e.target.value].slice(0, CAPTION_MAX).join(""))}
          rows={2}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          className="rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-muted">{labels.emoji}</span>
          <ul className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none]">
            {EMOJI.map((e) => (
              <li key={e}>
                <button type="button" onClick={() => setText((t) => [...(t + e)].slice(0, CAPTION_MAX).join(""))} className="flex size-11 items-center justify-center rounded-xl text-2xl hover:bg-surface">
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-muted">{labels.color}</span>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={colour === c}
              onClick={() => setColour(c)}
              className={`size-8 rounded-full border-2 ${colour === c ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={pill} onClick={() => setPill((p) => !p)} className={`min-h-10 rounded-full px-4 text-sm font-bold ${pill ? "bg-foreground text-background" : "bg-surface"}`}>
            {labels.background}
          </button>
          <span className="ms-2 text-xs font-bold text-muted">{labels.size}</span>
          {labels.sizes.map((s, i) => (
            <button key={s} type="button" aria-pressed={size === i} onClick={() => setSize(i)} className={`min-h-10 rounded-full px-4 text-sm font-bold ${size === i ? "bg-foreground text-background" : "bg-surface"}`}>
              {s}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold text-accent-ink">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" disabled={busy || !preview} onClick={save} className="min-h-12 flex-1 rounded-full bg-accent px-5 font-extrabold text-white disabled:opacity-50">
            {labels.save}
          </button>
          {initial && (
            <button type="button" disabled={busy} onClick={remove} className="min-h-12 rounded-full border border-line px-5 font-bold disabled:opacity-50">
              {labels.remove}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// The saved writing over a shot: its image, placed on the frame. `framed` centres a 9:16
// frame in a wider or taller area (full-screen viewer, Discover) so the writing sits
// where its owner put it; a tile uses the tile itself.
export function CaptionOverlay({ caption, framed = false }: { caption: CaptionView | null | undefined; framed?: boolean }) {
  if (!caption) return null;
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  const image = <img src={caption.url} alt={caption.text} draggable={false} className="pointer-events-none absolute z-[1] select-none" style={captionStyle(caption)} />;
  if (!framed) return image;
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] flex justify-center">
      <div className="relative aspect-[9/16] h-full max-w-full">{image}</div>
    </div>
  );
}
