"use client";

import type { PlaceOption } from "@/app/PlaceField";

export type PlaceGuessLabels = { guess: string; yes: string; other: string };

// «📍 أرطاس؟ — أيوه، هون»: the place the moment's name says (src/server/place-guess.ts), one tap
// to confirm; the place box stays under it for another answer. Never set without that tap.
export function PlaceGuess({ guess, labels, busy, onYes }: { guess: PlaceOption; labels: PlaceGuessLabels; busy?: boolean; onYes: (place: PlaceOption) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-2xl border-2 border-secondary/40 bg-background px-3 py-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-extrabold">{labels.guess.replace("{place}", guess.name)}</span>
          {guess.context && <span className="truncate text-xs text-muted">{guess.context}</span>}
        </span>
        <button type="button" disabled={busy} onClick={() => onYes(guess)} className="min-h-10 shrink-0 rounded-full bg-secondary px-4 text-sm font-extrabold text-white disabled:opacity-60">
          {busy ? "…" : labels.yes}
        </button>
      </div>
      <span className="text-xs text-muted">{labels.other}</span>
    </div>
  );
}
