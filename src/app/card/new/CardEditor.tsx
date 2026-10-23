"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CARD_COLORS, CARD_FONTS, CARD_KINDS, CARD_PLACES, CARD_TEXT_MAX, DEFAULT_CARD_STYLE, cardStyle, styleKey, type CardFont, type CardKind } from "@/lib/card-styles";
import type { Dictionary } from "@/i18n/server";

type Labels = Dictionary["card"];
type Idea = { kind: CardKind; text: string };

// The card is drawn here, on the phone: the picture (cropped to at most 3:4 tall, 1:1 wide), the
// words over it in the chosen look, and a small «📷 … · zawmo.com» in the corner. Shared
// privately it goes straight from the phone; published, the finished JPEG is sent to be kept.
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

export function CardEditor({
  shot,
  fonts,
  canPublish,
  signIn,
  labels,
}: {
  shot: { id: string; image: string; by: string };
  fonts: Record<CardFont, string>;
  canPublish: boolean;
  signIn: ReactNode;
  labels: Labels;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const picture = useRef<HTMLImageElement | null>(null);
  const card = useRef<Blob | null>(null);
  const [ready, setReady] = useState(false);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [tab, setTab] = useState<CardKind | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CardKind>("other");
  const [style, setStyle] = useState(DEFAULT_CARD_STYLE);
  const look = cardStyle(style);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The picture (same address as the page, so the canvas may be saved), then Gemini's lines.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      picture.current = img;
      setReady(true);
    };
    img.src = shot.image;
    fetch(`/api/cards/ideas?shot=${shot.id}`)
      .then((r) => (r.ok ? r.json() : { ideas: [] }))
      .then((d: { ideas?: Idea[] }) => setIdeas(d.ideas ?? []))
      .catch(() => setIdeas([]));
  }, [shot.id, shot.image]);

  useEffect(() => {
    const img = picture.current;
    const el = canvas.current;
    if (!ready || !img || !el) return;
    let cancelled = false;
    const look = cardStyle(style);
    const family = fonts[look.font];
    const dark = look.color === "black";
    (async () => {
      await document.fonts.load(`${look.weight} 64px ${family}`).catch(() => null);
      if (cancelled) return;
      const ratio = Math.min(4 / 3, Math.max(1, img.naturalHeight / img.naturalWidth));
      const H = Math.round(W * ratio);
      el.width = W;
      el.height = H;
      const ctx = el.getContext("2d")!;
      // The picture, covering the card.
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

      const words = text.trim();
      if (words) {
        ctx.direction = "rtl";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let size = 84;
        let lines: string[] = [];
        for (; size >= 44; size -= 4) {
          ctx.font = `${look.weight} ${size}px ${family}`;
          lines = wrap(ctx, words, W * 0.82);
          if (lines.length <= 4) break;
        }
        const lineH = size * 1.45;
        const block = lines.length * lineH;
        const top = look.place === "top" ? H * 0.1 : look.place === "center" ? (H - block) / 2 : H * 0.84 - block;
        // No band behind the words (his call): a soft shadow and a thin outline keep them readable
        // over any picture — dark around light words, light around black ones.
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, size / 22);
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.35)";
        ctx.shadowColor = dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 18;
        lines.forEach((l, i) => ctx.strokeText(l, W / 2, top + lineH * (i + 0.5)));
        ctx.shadowBlur = 0;
        ctx.fillStyle = look.hex;
        lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lineH * (i + 0.5)));
      }
      // The mark, small in the corner: whose picture it is, and Zawmo.
      ctx.direction = "rtl";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 24px ${fonts.cairo}`;
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(`📷 ${labels.photoBy.replace("{name}", shot.by)} · zawmo.com`, 26, H - 24);
      ctx.shadowBlur = 0;
      // The finished card as a JPEG, ready before any tap: a phone opens its share sheet only
      // straight from the tap (iPhone refuses it after waiting for the picture).
      card.current = null;
      try {
        el.toBlob((b) => {
          if (!cancelled) card.current = b;
        }, "image/jpeg", 0.9);
      } catch {
        // (a picture the canvas may not export — the buttons then say so)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, text, style, fonts, labels.photoBy, shot.by]);

  // The card as it is now (made after each drawing above). Until 2026-10-23 this asked the canvas at
  // the tap, and wrongly took «no picture» at once — both buttons did nothing.
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
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "zawmo-card.jpg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function publish() {
    setError("");
    const blob = await jpeg();
    if (!text.trim()) return;
    if (!blob) {
      setError(labels.errors.generic);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("shot", shot.id);
    form.set("text", text.trim());
    form.set("kind", kind);
    form.set("style", style);
    form.set("image", blob, "card.jpg");
    const res = await fetch("/api/cards", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (res?.ok && body?.id) {
      router.push(`/c/${body.id}`);
      return;
    }
    setBusy(false);
    setError(body?.error === "words" ? labels.errors.words : labels.errors.generic);
  }

  const shown = ideas?.filter((i) => !tab || i.kind === tab) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <canvas ref={canvas} width={W} height={Math.round((W * 4) / 3)} className="h-auto w-full rounded-3xl bg-black shadow-md" aria-label={text || labels.title} />

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-extrabold">{labels.ideas}</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <button type="button" onClick={() => setTab(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${tab ? "bg-surface" : "bg-accent text-white"}`}>
            ✨
          </button>
          {CARD_KINDS.filter((k) => k !== "other").map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${tab === k ? "bg-accent text-white" : "bg-surface"}`}>
              {labels.kinds[k]}
            </button>
          ))}
        </div>
        {ideas === null ? (
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

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-extrabold">{labels.style}</h2>
        {/* The font: each chip written in its own font. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {CARD_FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStyle(styleKey({ ...look, font: f.key }))}
              style={{ fontFamily: fonts[f.key], fontWeight: f.weight }}
              className={`shrink-0 rounded-xl px-4 py-2 text-lg ${look.font === f.key ? "bg-black text-white ring-2 ring-accent" : "bg-surface"}`}
            >
              صباح الخير
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CARD_PLACES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setStyle(styleKey({ ...look, place: p }))}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${look.place === p ? "bg-accent text-white" : "bg-surface"}`}
            >
              {labels.places[p]}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-muted/30" aria-hidden="true" />
          {(Object.keys(CARD_COLORS) as (keyof typeof CARD_COLORS)[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setStyle(styleKey({ ...look, color: c }))}
              aria-label={labels.colors[c]}
              style={{ background: CARD_COLORS[c] }}
              className={`size-8 rounded-full border border-black/20 ${look.color === c ? "ring-2 ring-accent ring-offset-2" : ""}`}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={sharePrivately} disabled={!ready} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm disabled:opacity-50">
          {labels.sharePrivate}
        </button>
        <p className="text-center text-xs text-muted">{labels.sharePrivateHint}</p>
        {canPublish ? (
          <>
            <button type="button" onClick={publish} disabled={!ready || busy || !text.trim()} className="min-h-12 rounded-full bg-surface px-6 font-extrabold disabled:opacity-50">
              {busy ? labels.publishing : labels.publish}
            </button>
            <p className="text-center text-xs text-muted">{labels.publishHint}</p>
          </>
        ) : (
          signIn
        )}
        {error && (
          <p role="alert" className="text-center text-sm font-bold text-accent">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
