"use client";

import { useState } from "react";
import { SCENES, type Scene } from "@/lib/scenes";

export type JoinSuggestion = {
  momentCode: string;
  title: string;
  hostName: string;
  scene: Scene;
  placeName: string | null;
  angleCount: number;
  coverUrl: string | null;
};

export type JoinLabels = {
  headline: string; // «{emoji} {name} صوّر نفس ال{scene} {place}»
  inPlace: string; // «في {place}»
  angles: string; // «{n} زوايا»
  join: string;
  keep: string;
  publicNote: string;
  failed: string;
};

// «صوّر معك», right after an upload: someone nearby shot the same moment just now — add this
// shot to their moment, or keep it here. One tap either way; nothing is asked again.
export function JoinCard({
  angleId,
  suggestion,
  locale,
  labels,
  onJoined,
  onKeep,
}: {
  angleId: string;
  suggestion: JoinSuggestion;
  locale: string;
  labels: JoinLabels;
  onJoined: (code: string) => void;
  onKeep: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const scene = SCENES[suggestion.scene];
  const headline = labels.headline
    .replace("{emoji}", scene.emoji)
    .replace("{name}", suggestion.hostName)
    .replace("{scene}", locale === "ar" ? scene.ar : scene.en.toLowerCase())
    .replace("{place}", suggestion.placeName ? labels.inPlace.replace("{place}", suggestion.placeName) : "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <section role="dialog" aria-label={headline} className="flex flex-col gap-3 rounded-3xl border-2 border-moment/60 bg-moment/10 p-4">
      <div className="flex items-center gap-3">
        {suggestion.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={suggestion.coverUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-surface text-3xl">
            {scene.emoji}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-extrabold leading-snug">{headline}</p>
          <p className="truncate text-sm text-muted">
            «{suggestion.title}» · {labels.angles.replace("{n}", String(suggestion.angleCount))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            const res = await fetch(`/api/angles/${angleId}/join`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ code: suggestion.momentCode }),
            }).catch(() => null);
            setBusy(false);
            if (!res?.ok) return setFailed(true);
            onJoined(((await res.json()) as { code: string }).code);
          }}
          className="min-h-11 flex-1 rounded-full bg-accent px-4 font-extrabold text-white disabled:opacity-60"
        >
          {labels.join}
        </button>
        <button type="button" disabled={busy} onClick={onKeep} className="min-h-11 rounded-full bg-background px-4 font-bold text-muted">
          {labels.keep}
        </button>
      </div>
      <p className="text-xs text-muted">{failed ? labels.failed : labels.publicNote}</p>
    </section>
  );
}
