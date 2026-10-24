"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CARD_COLORS,
  CARD_FONTS,
  CARD_FRAMES,
  CARD_PLACES,
  CARD_SIZE,
  CARD_TEXT_MAX,
  CARD_TILT,
  DEFAULT_CARD_STYLE,
  OCCASIONS,
  cardStyle,
  lightColor,
  styleKey,
  type CardColor,
  type CardFont,
  type CardKind,
  type CardStyle,
} from "@/lib/card-styles";
import type { Dictionary } from "@/i18n/server";
import { CardBridge } from "@/app/cards/CardBridge";
import { cardStep } from "@/lib/funnel";

type Labels = Dictionary["card"];
type Idea = { kind: CardKind; text: string };
type Tab = Exclude<CardKind, "other">;
// The picture to write on: a public shot (its lines from Gemini, publishable), or one of the
// visitor's own photos (2026-10-24: never uploaded — ready lines, shared privately only).
export type CardPicture = { image: string; by: string | null; shotId: string | null };

// The card is drawn here, on the phone: the picture (cropped to at most 3:4 tall, 1:1 wide), the
// words over it in the chosen look — dragged anywhere, sized, tilted like a stamp — and a small
// «📷 … · zawmo.com» in the corner. Shared privately it goes straight from the phone; published,
// the finished JPEG is sent to be kept.
const W = 1080;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// The words' first colour, from the picture where they sit: dark words on a bright place, light
// words with an outline on a busy one, light words otherwise — so they read without a choice.
function autoLook(img: HTMLImageElement, y: number): Pick<CardStyle, "color" | "frame" | "frameColor"> {
  try {
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 64;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 48, 64);
    const top = Math.max(0, Math.round((y / 100) * 64) - 8);
    const { data } = ctx.getImageData(6, top, 36, 16);
    const lum: number[] = [];
    for (let i = 0; i < data.length; i += 4) lum.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const spread = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    if (spread > 0.2) return { color: "white", frame: "outline", frameColor: "black" };
    if (mean > 0.62) return { color: "black", frame: "none", frameColor: "white" };
    return { color: "white", frame: "none", frameColor: "black" };
  } catch {
    return { color: "white", frame: "none", frameColor: "black" };
  }
}

// A point on the screen → on the card; and whether it is on the words (with a finger's margin).
type Box = { cx: number; cy: number; w: number; h: number; tilt: number };
function toCanvas(el: HTMLCanvasElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  return { px: ((clientX - r.left) * el.width) / r.width, py: ((clientY - r.top) * el.height) / r.height };
}
function onBox(el: HTMLCanvasElement, b: Box | null, clientX: number, clientY: number) {
  if (!b) return false;
  const { px, py } = toCanvas(el, clientX, clientY);
  const a = (-b.tilt * Math.PI) / 180;
  const dx = (px - b.cx) * Math.cos(a) - (py - b.cy) * Math.sin(a);
  const dy = (px - b.cx) * Math.sin(a) + (py - b.cy) * Math.cos(a);
  return Math.abs(dx) <= b.w / 2 + 40 && Math.abs(dy) <= b.h / 2 + 40;
}

export function CardEditor({
  picture,
  fonts,
  kinds,
  canPublish,
  signIn,
  labels,
  onOtherPicture,
}: {
  picture: CardPicture;
  fonts: Record<CardFont, string>;
  kinds: Tab[];
  canPublish: boolean;
  signIn: ReactNode;
  labels: Labels;
  onOtherPicture?: () => void;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const card = useRef<Blob | null>(null);
  // Where the words are drawn (canvas pixels), for dragging them.
  const box = useRef<Box | null>(null);
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null);
  const chosen = useRef(false); // the colour was picked by hand: no more automatic one
  const [ready, setReady] = useState(false);
  const [ideas, setIdeas] = useState<Idea[] | null>(picture.shotId ? null : []);
  const [tab, setTab] = useState<Tab | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CardKind>("other");
  const [style, setStyle] = useState(DEFAULT_CARD_STYLE);
  const look = cardStyle(style);
  const set = (patch: Partial<CardStyle>) => setStyle((s) => styleKey({ ...cardStyle(s), ...patch }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // The picture (same address as the page, or the phone's own, so the canvas may be saved), then
  // Gemini's lines for a public shot.
  useEffect(() => {
    cardStep("opened");
    const el = new Image();
    el.onload = () => {
      img.current = el;
      if (!chosen.current) setStyle((s) => styleKey({ ...cardStyle(s), ...autoLook(el, cardStyle(s).y) }));
      setReady(true);
    };
    el.src = picture.image;
    if (!picture.shotId) return;
    fetch(`/api/cards/ideas?shot=${picture.shotId}`)
      .then((r) => (r.ok ? r.json() : { ideas: [] }))
      .then((d: { ideas?: Idea[] }) => setIdeas(d.ideas ?? []))
      .catch(() => setIdeas([]));
  }, [picture.image, picture.shotId]);

  useEffect(() => {
    const pic = img.current;
    const el = canvas.current;
    if (!ready || !pic || !el) return;
    let cancelled = false;
    let save: ReturnType<typeof setTimeout> | undefined;
    const look = cardStyle(style);
    const family = fonts[look.font];
    (async () => {
      await document.fonts.load(`${look.weight} 64px ${family}`).catch(() => null);
      if (cancelled) return;
      const ratio = Math.min(4 / 3, Math.max(1, pic.naturalHeight / pic.naturalWidth));
      const H = Math.round(W * ratio);
      el.width = W;
      el.height = H;
      const ctx = el.getContext("2d")!;
      // The picture, covering the card.
      const scale = Math.max(W / pic.naturalWidth, H / pic.naturalHeight);
      const dw = pic.naturalWidth * scale;
      const dh = pic.naturalHeight * scale;
      ctx.drawImage(pic, (W - dw) / 2, (H - dh) / 2, dw, dh);

      const words = text.trim();
      box.current = null;
      if (words) {
        ctx.direction = "rtl";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // The size that fits in four lines, then the chosen size of it.
        let fit = 84;
        for (; fit > 44; fit -= 4) {
          ctx.font = `${look.weight} ${fit}px ${family}`;
          if (wrap(ctx, words, W * 0.82).length <= 4) break;
        }
        const size = Math.round((fit * look.size) / 100);
        ctx.font = `${look.weight} ${size}px ${family}`;
        const lines = wrap(ctx, words, W * 0.82);
        const lineH = size * 1.45;
        const block = lines.length * lineH;
        const widths = lines.map((l) => ctx.measureText(l).width);
        const cx = (look.x / 100) * W;
        const cy = (look.y / 100) * H;
        box.current = { cx, cy, w: Math.max(...widths) + size * 0.6, h: block, tilt: look.tilt };
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((look.tilt * Math.PI) / 180);
        const at = (i: number) => -block / 2 + lineH * (i + 0.5);
        if (look.frame === "band") {
          // A soft band behind each line, in the frame's colour.
          ctx.fillStyle = look.frameHex;
          ctx.globalAlpha = 0.6;
          lines.forEach((_, i) => {
            const pad = size * 0.3;
            ctx.beginPath();
            ctx.roundRect(-widths[i] / 2 - pad, at(i) - lineH / 2 + size * 0.08, widths[i] + pad * 2, lineH - size * 0.16, size * 0.25);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        } else if (look.frame === "outline") {
          // An outline in the frame's colour, with a little shadow under it.
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(4, size / 7);
          ctx.strokeStyle = look.frameHex;
          ctx.shadowColor = "rgba(0,0,0,0.45)";
          ctx.shadowBlur = size * 0.12;
          ctx.shadowOffsetY = size * 0.04;
          lines.forEach((l, i) => ctx.strokeText(l, 0, at(i)));
          ctx.shadowColor = "transparent";
          ctx.shadowOffsetY = 0;
        }
        // The words as if part of the picture (his ask, 2026-10-24): no hard edge — a wide, faint
        // shadow that lifts them from any background, then a close, soft one under the letters
        // (dark under light words, light under dark ones), and the colour a touch less than solid.
        const light = lightColor(look.color);
        const shade = (a: number) => (light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);
        ctx.fillStyle = look.hex;
        if (look.frame === "none") {
          ctx.shadowColor = shade(0.38);
          ctx.shadowBlur = size * 0.55;
          lines.forEach((l, i) => ctx.fillText(l, 0, at(i)));
          ctx.shadowColor = shade(0.6);
          ctx.shadowBlur = size * 0.12;
          ctx.shadowOffsetY = size * 0.035;
        }
        ctx.globalAlpha = 0.97;
        lines.forEach((l, i) => ctx.fillText(l, 0, at(i)));
        ctx.restore();
      }
      // The mark, small in the corner: whose picture it is (a Zawmo shot), and Zawmo.
      ctx.direction = "rtl";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 24px ${fonts.cairo}`;
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(picture.by ? `📷 ${labels.photoBy.replace("{name}", picture.by)} · zawmo.com` : "zawmo.com", 26, H - 24);
      ctx.shadowBlur = 0;
      // The finished card as a JPEG, ready before any tap: a phone opens its share sheet only
      // straight from the tap (iPhone refuses it after waiting for the picture). Made once the
      // card stops changing (not on every step of a drag).
      card.current = null;
      save = setTimeout(() => {
        try {
          el.toBlob((b) => {
            if (!cancelled) card.current = b;
          }, "image/jpeg", 0.9);
        } catch {
          // (a picture the canvas may not export — the buttons then say so)
        }
      }, 150);
    })();
    return () => {
      cancelled = true;
      clearTimeout(save);
    };
  }, [ready, text, style, fonts, labels.photoBy, picture.by]);

  // Dragging the words: a finger on them moves them (and doesn't scroll the page); elsewhere on the
  // picture the page scrolls as usual.
  const point = (x: number, y: number) => toCanvas(canvas.current!, x, y);
  const onWords = (x: number, y: number) => onBox(canvas.current!, box.current, x, y);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && onBox(el, box.current, t.clientX, t.clientY)) e.preventDefault();
    };
    el.addEventListener("touchstart", hold, { passive: false });
    return () => el.removeEventListener("touchstart", hold);
  }, []);

  // The card as it is now (made after each drawing above).
  const jpeg = () =>
    card.current
      ? Promise.resolve(card.current)
      : new Promise<Blob | null>((done) => {
          const el = canvas.current;
          if (!el) return done(null);
          try {
            el.toBlob(done, "image/jpeg", 0.9);
          } catch {
            done(null);
          }
        });

  function sharePrivately() {
    setError("");
    const blob = card.current;
    if (!blob) {
      setError(labels.errors.generic);
      return;
    }
    const file = new File([blob], "zawmo-card.jpg", { type: "image/jpeg" });
    const shared = () => {
      cardStep("shared");
      setSent(true);
    };
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).then(shared).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "zawmo-card.jpg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    shared();
  }

  async function publish() {
    setError("");
    const blob = await jpeg();
    if (!text.trim() || !picture.shotId) return;
    if (!blob) {
      setError(labels.errors.generic);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("shot", picture.shotId);
    form.set("text", text.trim());
    form.set("kind", kind);
    form.set("style", style);
    form.set("image", blob, "card.jpg");
    const res = await fetch("/api/cards", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (res?.ok && body?.id) {
      cardStep("published");
      router.push(`/c/${body.id}`);
      return;
    }
    setBusy(false);
    setError(body?.error === "words" ? labels.errors.words : labels.errors.generic);
  }

  // Lines: Gemini's for the picture, and the ready ones — for an occasion, or for one's own photo.
  const ready_ = (k: CardKind) => (labels.ready[k] ?? []).map((t) => ({ kind: k, text: t }));
  const occasion = tab && (OCCASIONS as readonly string[]).includes(tab);
  const shown: Idea[] =
    ideas === null && !occasion
      ? []
      : tab
        ? occasion || !picture.shotId
          ? ready_(tab)
          : (ideas ?? []).filter((i) => i.kind === tab)
        : picture.shotId
          ? (ideas ?? [])
          : kinds.slice(0, 5).flatMap((k) => ready_(k).slice(0, 2));
  const swatch = (c: CardColor, on: boolean, pick: () => void, name: string) => (
    <button
      key={c}
      type="button"
      onClick={pick}
      aria-label={name}
      aria-pressed={on}
      style={{ background: CARD_COLORS[c] }}
      className={`size-8 shrink-0 rounded-full border border-black/20 ${on ? "ring-2 ring-accent ring-offset-2" : ""}`}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <canvas
          ref={canvas}
          width={W}
          height={Math.round((W * 4) / 3)}
          className="h-auto w-full select-none rounded-3xl bg-black shadow-md"
          aria-label={text || labels.title}
          onPointerDown={(e) => {
            if (!onWords(e.clientX, e.clientY)) return;
            const { px, py } = point(e.clientX, e.clientY);
            drag.current = { id: e.pointerId, px, py, x: look.x, y: look.y };
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // (a pointer already gone — the drag still follows the moves)
            }
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const el = canvas.current;
            if (!d || d.id !== e.pointerId || !el) return;
            const { px, py } = point(e.clientX, e.clientY);
            set({ x: Math.min(95, Math.max(5, d.x + ((px - d.px) / el.width) * 100)), y: Math.min(95, Math.max(5, d.y + ((py - d.py) / el.height) * 100)) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          style={{ cursor: text ? "grab" : undefined }}
        />
        {text.trim() && <p className="text-center text-xs text-muted">{labels.dragHint}</p>}
        {onOtherPicture && (
          <button type="button" onClick={onOtherPicture} className="self-center text-sm font-bold text-secondary underline-offset-4 hover:underline">
            {labels.otherPicture}
          </button>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-extrabold">{picture.shotId ? labels.ideas : labels.readyLines}</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <button type="button" onClick={() => setTab(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${tab ? "bg-surface" : "bg-accent text-white"}`}>
            ✨
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${tab === k ? "bg-accent text-white" : "bg-surface"}`}>
              {labels.kinds[k]}
            </button>
          ))}
        </div>
        {ideas === null && !occasion ? (
          <p className="animate-pulse text-sm text-muted">{labels.loading}</p>
        ) : shown.length ? (
          <ul className="flex flex-col gap-2">
            {shown.map((i) => (
              <li key={i.text}>
                <button
                  type="button"
                  onClick={() => {
                    setText(i.text);
                    setKind(i.kind);
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-start text-base leading-relaxed ${text === i.text ? "bg-accent/15 ring-2 ring-accent" : "bg-surface"}`}
                >
                  {i.text}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{labels.noIdeas}</p>
        )}
      </section>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, CARD_TEXT_MAX))}
        placeholder={labels.write}
        rows={2}
        dir="auto"
        className="w-full rounded-2xl bg-surface px-4 py-3 text-base"
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-extrabold">{labels.style}</h2>
        {/* The font: each chip written in its own font. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {CARD_FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => set({ font: f.key })}
              style={{ fontFamily: fonts[f.key], fontWeight: f.weight }}
              className={`shrink-0 rounded-xl px-4 py-2 text-lg ${look.font === f.key ? "bg-black text-white ring-2 ring-accent" : "bg-surface"}`}
            >
              صباح الخير
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CARD_PLACES) as (keyof typeof CARD_PLACES)[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set({ x: 50, y: CARD_PLACES[p] })}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${look.x === 50 && look.y === CARD_PLACES[p] ? "bg-accent text-white" : "bg-surface"}`}
            >
              {labels.places[p]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm font-bold">
          <span className="w-20 shrink-0">{labels.size}</span>
          <input type="range" min={CARD_SIZE.min} max={CARD_SIZE.max} step={5} value={look.size} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full accent-accent" />
        </label>
        <div className="flex items-center gap-3 text-sm font-bold">
          <label htmlFor="card-tilt" className="w-20 shrink-0">
            {labels.tilt}
          </label>
          <input
            id="card-tilt"
            type="range"
            min={-CARD_TILT}
            max={CARD_TILT}
            step={1}
            value={look.tilt}
            // (dir ltr: dragging right tilts the words up to the right, like turning a stamp)
            dir="ltr"
            onChange={(e) => {
              const t = Number(e.target.value);
              set({ tilt: Math.abs(t) <= 2 ? 0 : t });
            }}
            className="w-full accent-accent"
          />
          <button type="button" onClick={() => set({ tilt: 0 })} disabled={look.tilt === 0} className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs disabled:opacity-40">
            {labels.straight}
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{labels.colorTitle}</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CARD_COLORS) as CardColor[]).map((c) =>
              swatch(
                c,
                look.color === c,
                () => {
                  chosen.current = true;
                  set({ color: c, frameColor: lightColor(c) === lightColor(look.frameColor) ? (lightColor(c) ? "black" : "white") : look.frameColor });
                },
                labels.colors[c],
              ),
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{labels.frame}</span>
          <div className="flex flex-wrap gap-2">
            {CARD_FRAMES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  chosen.current = true;
                  set({ frame: f });
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${look.frame === f ? "bg-accent text-white" : "bg-surface"}`}
              >
                {labels.frames[f]}
              </button>
            ))}
          </div>
          {look.frame !== "none" && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted">{labels.frameColor}</span>
              {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => swatch(c, look.frameColor === c, () => set({ frameColor: c }), labels.colors[c]))}
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={sharePrivately} disabled={!ready} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm disabled:opacity-50">
          {labels.sharePrivate}
        </button>
        <p className="text-center text-xs text-muted">{picture.shotId ? labels.sharePrivateHint : labels.ownNote}</p>
        {sent && (picture.shotId ? <CardBridge text={labels.bridge.replace("{name}", picture.by ?? "")} button={labels.bridgeButton} /> : <CardBridge text={labels.bridgeOwn} button={labels.bridgeButton} />)}
        {picture.shotId &&
          (canPublish ? (
            <>
              <button type="button" onClick={publish} disabled={!ready || busy || !text.trim()} className="min-h-12 rounded-full bg-surface px-6 font-extrabold disabled:opacity-50">
                {busy ? labels.publishing : labels.publish}
              </button>
              <p className="text-center text-xs text-muted">{labels.publishHint}</p>
            </>
          ) : (
            signIn
          ))}
        {error && (
          <p role="alert" className="text-center text-sm font-bold text-accent">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
