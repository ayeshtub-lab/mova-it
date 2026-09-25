"use client";

import { useState } from "react";

type Option = { key: string; emoji: string; label: string; votes: number };
type Labels = { title: string; hint: string; voted: string; failed: string; votes: string };

// «صوّت لموضوع بكرة»: three themes from the curated list; counts show once you vote.
export function VoteBox({ initial, mine: initialMine, labels, signedIn }: { initial: Option[]; mine: string | null; labels: Labels; signedIn: boolean }) {
  const [options, setOptions] = useState(initial);
  const [mine, setMine] = useState(initialMine);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(key: string) {
    if (!signedIn || busy || key === mine) return;
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/daily/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: key }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    const data = (await res.json()) as { options: { key: string; votes: number }[]; mine: string | null };
    setOptions((list) => list.map((o) => ({ ...o, votes: data.options.find((x) => x.key === o.key)?.votes ?? o.votes })));
    setMine(data.mine);
  }

  const total = options.reduce((n, o) => n + o.votes, 0);
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
      <div>
        <h2 className="text-lg font-extrabold">{labels.title}</h2>
        <p className="text-xs text-muted">{mine ? labels.voted : labels.hint}</p>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0;
          const chosen = o.key === mine;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => choose(o.key)}
              disabled={busy || !signedIn}
              aria-pressed={chosen}
              className={`relative flex min-h-12 items-center gap-3 overflow-hidden rounded-2xl border px-4 text-start font-bold transition-colors disabled:cursor-default ${chosen ? "border-accent" : "border-line hover:border-accent/60"}`}
            >
              {mine && <span aria-hidden="true" className="absolute inset-y-0 start-0 bg-accent-soft transition-all" style={{ width: `${pct}%` }} />}
              <span className="relative text-xl">{o.emoji}</span>
              <span className="relative flex-1">{o.label}</span>
              {mine && <span className="relative text-xs text-muted">{labels.votes.replace("{n}", String(o.votes))}</span>}
              {chosen && <span className="relative text-accent-ink">✓</span>}
            </button>
          );
        })}
      </div>
      {failed && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {labels.failed}
        </p>
      )}
    </section>
  );
}
