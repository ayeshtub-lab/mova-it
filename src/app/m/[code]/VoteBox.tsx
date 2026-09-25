"use client";

import { useState } from "react";

type Option = { key: string; emoji: string; label: string; votes: number };
type Labels = { title: string; hint: string; voted: string; failed: string; votes: string; more: string; less: string };

// «صوّت لموضوع بكرة»: three featured themes, and a button that slides open every other
// theme from the list — any of them can win. Counts show once you've voted.
export function VoteBox({
  initial,
  initialMore,
  mine: initialMine,
  labels,
  signedIn,
}: {
  initial: Option[];
  initialMore: Option[];
  mine: string | null;
  labels: Labels;
  signedIn: boolean;
}) {
  const [featured, setFeatured] = useState(initial);
  const [more, setMore] = useState(initialMore);
  const [mine, setMine] = useState(initialMine);
  const [open, setOpen] = useState(() => !!initialMine && initialMore.some((o) => o.key === initialMine));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(key: string) {
    if (!signedIn || busy || key === mine) return;
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/daily/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: key }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    const data = (await res.json()) as { options: { key: string; votes: number }[]; more: { key: string; votes: number }[]; mine: string | null };
    const counts = new Map([...data.options, ...data.more].map((o) => [o.key, o.votes]));
    const update = (list: Option[]) => list.map((o) => ({ ...o, votes: counts.get(o.key) ?? o.votes }));
    setFeatured(update);
    setMore(update);
    setMine(data.mine);
  }

  const total = [...featured, ...more].reduce((n, o) => n + o.votes, 0);
  const row = (o: Option, compact = false) => {
    const pct = total ? Math.round((o.votes / total) * 100) : 0;
    const chosen = o.key === mine;
    return (
      <button
        key={o.key}
        type="button"
        onClick={() => choose(o.key)}
        disabled={busy || !signedIn}
        aria-pressed={chosen}
        className={`relative flex items-center gap-2 overflow-hidden rounded-2xl border text-start font-bold transition-colors disabled:cursor-default ${
          compact ? "min-h-11 px-3 text-sm" : "min-h-12 gap-3 px-4"
        } ${chosen ? "border-accent" : "border-line hover:border-accent/60"}`}
      >
        {mine && <span aria-hidden="true" className="absolute inset-y-0 start-0 bg-accent-soft transition-all" style={{ width: `${pct}%` }} />}
        <span className={`relative ${compact ? "text-lg" : "text-xl"}`}>{o.emoji}</span>
        <span className="relative flex-1 leading-snug">{o.label}</span>
        {mine && o.votes > 0 && <span className="relative text-xs text-muted">{labels.votes.replace("{n}", String(o.votes))}</span>}
        {chosen && <span className="relative text-accent-ink">✓</span>}
      </button>
    );
  };

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
      <div>
        <h2 className="text-lg font-extrabold">{labels.title}</h2>
        <p className="text-xs text-muted">{mine ? labels.voted : labels.hint}</p>
      </div>
      <div className="flex flex-col gap-2">{featured.map((o) => row(o))}</div>

      {more.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-h-11 items-center justify-center gap-2 self-center rounded-full bg-background px-5 text-sm font-bold text-secondary shadow-sm transition-transform active:scale-95"
          >
            {open ? labels.less : labels.more.replace("{n}", String(more.length))}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={`size-4 transition-transform duration-300 ${open ? "rotate-180" : "motion-safe:animate-bounce"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {/* Slides open: the grid row grows from 0fr to 1fr. */}
          <div className={`grid transition-[grid-template-rows] duration-500 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <div className="grid grid-cols-2 gap-2 pt-1">{more.map((o) => row(o, true))}</div>
            </div>
          </div>
        </>
      )}

      {failed && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {labels.failed}
        </p>
      )}
    </section>
  );
}
