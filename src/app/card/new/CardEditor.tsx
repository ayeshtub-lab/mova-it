"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CARD_KINDS, CARD_STYLES, CARD_TEXT_MAX, cardStyle, type CardKind } from "@/lib/card-styles";
import type { Dictionary } from "@/i18n/server";

type Labels = Dictionary["card"];
type Idea = { kind: CardKind; text: string };

// The card is drawn here, on the phone: the picture (cropped to at most 3:4 tall, 1:1 wide), the
// words over it in the chosen look, and a small «zawmo.com · الصورة: …» at the foot. Shared
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
  fonts: Record<"cairo" | "amiri" | "kufi", string>;
  canPublish: boolean;
  signIn: ReactNode;
  labels: Labels;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const picture = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [tab, setTab] = useState<CardKind | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CardKind>("other");
  const [style, setStyle] = useState(CARD_STYLES[0].key);
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
      // A soft shade at the foot, for the mark.
      const foot = ctx.createLinearGradient(0, H - 160, 0, H);
      foot.addColorStop(0, "rgba(0,0,0,0)");
      foot.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = foot;
      ctx.fillRect(0, H - 160, W, 160);

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
        if (look.band) {
          const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
          const bw = Math.min(W * 0.94, widest + 96);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.beginPath();
          ctx.roundRect((W - bw) / 2, top - 28, bw, block + 56, 36);
          ctx.fill();
        }
        ctx.fillStyle = look.color;
        ctx.shadowColor = "rgba(0,0,0,0.65)";
        ctx.shadowBlur = look.band ? 6 : 18;
        lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lineH * (i + 0.5)));
        ctx.shadowBlur = 0;
      }
      // The mark: Zawmo, and whose picture it is.
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 30px ${fonts.cairo}`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(`zawmo.com · ${labels.photoBy.replace("{name}", shot.by)}`, W / 2, H - 36);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, text, style, fonts, labels.photoBy, shot.by]);

  const jpeg = () => new Promise<Blob | null>((done) => canvas.current?.toBlob(done, "image/jpeg", 0.9) ?? done(null));

  async function sharePrivately() {
    setError("");
    const blob = await jpeg();
    if (!blob) return;
    const file = new File([blob], "zawmo-card.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
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
    if (!blob || !text.trim()) return;
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
        <div className="flex flex-wrap gap-2">
          {CARD_STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStyle(s.key)}
              style={{ fontFamily: fonts[s.font], color: s.color === "#ffffff" ? undefined : s.color }}
              className={`rounded-xl px-4 py-2 text-lg font-bold ${style === s.key ? "bg-black text-white ring-2 ring-accent" : "bg-surface"}`}
            >
              صباح الخير
            </button>
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
