"use client";

import { useState } from "react";
import { FILTERS, filterName } from "@/lib/filters";

export type ShotEditorLabels = {
  title: string;
  filters: string;
  natural: string;
  stamp: string;
  stampHint: string;
  sound: string;
  noSound: string;
  save: string;
  cancel: string;
};

// «✨ عدّل اللقطة»: a look for the shot (previewed on the shot itself), the retro date
// stamp, and a way to its sound. Nothing touches the file: the look is applied when the
// shot is shown and burnt into montages.
export function ShotEditor({
  imageUrl,
  locale,
  labels,
  initialFilter,
  initialStamp,
  stampPreview,
  soundName,
  busy = false,
  onSave,
  onSound,
  onClose,
}: {
  imageUrl: string | null;
  locale: string;
  labels: ShotEditorLabels;
  initialFilter: string | null;
  initialStamp: boolean;
  stampPreview: string;
  soundName: string | null;
  busy?: boolean;
  onSave: (filter: string | null, stamp: boolean) => void;
  onSound: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [stamp, setStamp] = useState(initialStamp);
  const css = FILTERS.find((f) => f.key === filter)?.css;
  const options = [{ key: null, name: labels.natural, css: undefined as string | undefined }, ...FILTERS.map((f) => ({ key: f.key as string | null, name: filterName(f, locale), css: f.css }))];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 text-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{labels.title}</h2>
          <button type="button" onClick={onClose} aria-label={labels.cancel} className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
            <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {/* The shot with the chosen look and stamp, as others will see it. */}
        {imageUrl && (
          <div className="relative mx-auto aspect-[3/4] w-40 overflow-hidden rounded-2xl bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview or signed URL */}
            <img src={imageUrl} alt="" className="size-full object-cover" style={{ filter: css }} />
            {stamp && <span className="stamp absolute bottom-2 end-2 text-[10px]">{stampPreview}</span>}
          </div>
        )}

        <h3 className="text-sm font-extrabold">{labels.filters}</h3>
        <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {options.map((o) => (
            <li key={o.key ?? "none"} className="shrink-0">
              <button type="button" onClick={() => setFilter(o.key)} aria-pressed={filter === o.key} className="flex w-16 flex-col items-center gap-1">
                <span className={`block size-16 overflow-hidden rounded-2xl border-2 bg-surface ${filter === o.key ? "border-accent" : "border-transparent"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- preview thumbnail */}
                  {imageUrl && <img src={imageUrl} alt="" className="size-full object-cover" style={{ filter: o.css }} />}
                </span>
                <span className={`text-[11px] font-bold ${filter === o.key ? "text-accent-ink" : "text-muted"}`}>{o.name}</span>
              </button>
            </li>
          ))}
        </ul>

        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface px-4">
          <span className="flex flex-col">
            <span className="font-bold">🕐 {labels.stamp}</span>
            <span className="text-xs text-muted">{labels.stampHint}</span>
          </span>
          <input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        </label>

        <button type="button" onClick={onSound} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-surface px-4 text-start font-bold">
          <span>🎵 {labels.sound}</span>
          <span className="truncate text-sm text-secondary">{soundName ?? labels.noSound} ‹</span>
        </button>

        <button type="button" disabled={busy} onClick={() => onSave(filter, stamp)} className="min-h-12 rounded-full bg-accent px-5 font-extrabold text-white disabled:opacity-60">
          {labels.save}
        </button>
      </section>
    </div>
  );
}
