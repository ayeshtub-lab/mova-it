"use client";

import { useEffect, useRef, useState } from "react";
import { isSolemn, SOUND_CATEGORIES, SOUNDS, soundByKey, soundFile, soundName, type SoundCategory } from "@/lib/sounds";

export type SoundLabels = {
  title: string;
  none: string;
  cats: Record<SoundCategory, string>;
  preview: string;
  stop: string;
  chosen: string;
  muteOriginal: string;
  solemnNote: string;
  save: string;
  cancel: string;
};

// A bottom sheet over the page: browse the library by category, listen, pick one (or
// none). For a video, choose whether its own sound is muted under it — always muted
// under remembrance.
export function SoundPicker({
  locale,
  labels,
  initialKey,
  initialMute = false,
  isVideo = false,
  busy = false,
  onSave,
  onClose,
}: {
  locale: string;
  labels: SoundLabels;
  initialKey: string | null;
  initialMute?: boolean;
  isVideo?: boolean;
  busy?: boolean;
  onSave: (key: string | null, muteOriginal: boolean) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [mute, setMute] = useState(initialMute);
  const [cat, setCat] = useState<SoundCategory>(soundByKey(initialKey)?.cat ?? SOUND_CATEGORIES[0].key);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const solemn = isSolemn(soundByKey(key));

  useEffect(() => () => audio.current?.pause(), []);

  function preview(k: string) {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.onended = () => setPlaying(null);
    }
    if (playing === k) {
      audio.current.pause();
      return setPlaying(null);
    }
    audio.current.src = soundFile(k);
    audio.current.play().catch(() => {});
    setPlaying(k);
  }

  function close() {
    audio.current?.pause();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={close}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-background text-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-extrabold">{labels.title}</h2>
          <button type="button" onClick={close} aria-label={labels.cancel} className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
            <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div role="tablist" className="flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
          {SOUND_CATEGORIES.map((c) => (
            <button
              key={c.key}
              role="tab"
              type="button"
              aria-selected={cat === c.key}
              onClick={() => setCat(c.key)}
              className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-bold ${cat === c.key ? "bg-foreground text-background" : "bg-surface text-muted"}`}
            >
              {c.emoji} {labels.cats[c.key]}
            </button>
          ))}
        </div>

        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-5 py-2">
          <li>
            <button
              type="button"
              onClick={() => setKey(null)}
              aria-pressed={key === null}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border-2 px-3 text-start font-bold ${key === null ? "border-accent bg-accent-soft/40" : "border-line"}`}
            >
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-surface">🔇</span>
              {labels.none}
            </button>
          </li>
          {SOUNDS.filter((s) => s.cat === cat).map((s) => {
            const on = key === s.key;
            return (
              <li key={s.key} className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3 ${on ? "border-accent bg-accent-soft/40" : "border-line"}`}>
                <button
                  type="button"
                  onClick={() => preview(s.key)}
                  aria-label={playing === s.key ? labels.stop : labels.preview}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
                >
                  <svg viewBox="0 0 24 24" className="size-4 fill-current">
                    <path d={playing === s.key ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} />
                  </svg>
                </button>
                <button type="button" onClick={() => setKey(s.key)} aria-pressed={on} className="flex min-h-11 flex-1 items-center justify-between gap-2 text-start">
                  <span className="font-bold leading-snug">{soundName(s, locale)}</span>
                  <span className="shrink-0 text-xs text-muted">{on ? labels.chosen : `${Math.round(s.seconds)}″`}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-col gap-2 border-t border-line px-5 py-3">
          {isVideo && key && (
            <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={solemn || mute} disabled={solemn} onChange={(e) => setMute(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              {solemn ? labels.solemnNote : labels.muteOriginal}
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              audio.current?.pause();
              onSave(key, solemn || mute);
            }}
            className="min-h-12 rounded-full bg-accent px-5 font-extrabold text-white disabled:opacity-60"
          >
            {labels.save}
          </button>
        </footer>
      </section>
    </div>
  );
}
