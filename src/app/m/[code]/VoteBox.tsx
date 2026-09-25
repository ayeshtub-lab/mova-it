"use client";

import { useState } from "react";

type Option = { key: string; emoji: string; label: string; votes: number };
type Labels = {
  title: string;
  hint: string;
  voted: string;
  votedFor: string;
  confirm: string;
  change: string;
  cancel: string;
  failed: string;
  votes: string;
  more: string;
  less: string;
};

// «اختار موضوع بكرة»: three featured themes, and a button that slides open every other
// theme from the list — any of them can win. Pick one, then confirm; once your vote is
// in you see how the themes stand, and may change it until the new day starts.
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
  const [picked, setPicked] = useState<string | null>(initialMine);
  const [editing, setEditing] = useState(!initialMine);
  const [open, setOpen] = useState(() => !!initialMine && initialMore.some((o) => o.key === initialMine));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const all = [...featured, ...more];
  const theme = (key: string | null) => all.find((o) => o.key === key);

  async function confirm() {
    if (!signedIn || busy || !picked) return;
    if (picked === mine) return setEditing(false);
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/daily/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: picked }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    const data = (await res.json()) as { options: { key: string; votes: number }[]; more: { key: string; votes: number }[]; mine: string | null };
    const counts = new Map([...data.options, ...data.more].map((o) => [o.key, o.votes]));
    const update = (list: Option[]) => list.map((o) => ({ ...o, votes: counts.get(o.key) ?? o.votes }));
    setFeatured(update);
    setMore(update);
    setMine(data.mine);
    setEditing(false);
  }

  const total = all.reduce((n, o) => n + o.votes, 0);
  const showCounts = !!mine;
  const row = (o: Option, compact = false) => {
    const pct = total ? Math.round((o.votes / total) * 100) : 0;
    const chosen = editing ? o.key === picked : o.key === mine;
    return (
      <button
        key={o.key}
        type="button"
        onClick={() => setPicked(o.key)}
        disabled={!editing || busy || !signedIn}
        aria-pressed={chosen}
        className={`relative flex items-center gap-2 overflow-hidden rounded-2xl border-2 text-start font-bold transition-colors disabled:cursor-default ${
          compact ? "min-h-11 px-3 text-sm" : "min-h-12 gap-3 px-4"
        } ${chosen ? "border-accent bg-accent-soft/40" : "border-line enabled:hover:border-accent/60"}`}
      >
        {showCounts && <span aria-hidden="true" className="absolute inset-y-0 start-0 bg-accent-soft transition-all" style={{ width: `${pct}%` }} />}
        <span className={`relative ${compact ? "text-lg" : "text-xl"}`}>{o.emoji}</span>
        <span className="relative flex-1 leading-snug">{o.label}</span>
        {showCounts && o.votes > 0 && <span className="relative text-xs text-muted">{labels.votes.replace("{n}", String(o.votes))}</span>}
        {chosen && <span className="relative text-accent-ink">✓</span>}
      </button>
    );
  };

  const voted = theme(mine);

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
      <div>
        <h2 className="text-lg font-extrabold">{labels.title}</h2>
        <p className="text-xs text-muted">{labels.hint}</p>
      </div>

      {/* Your vote is in: say so clearly, with a way to change it. */}
      {!editing && voted && (
        <div className="flex flex-col gap-2 rounded-2xl bg-secondary-soft p-4">
          <p className="font-extrabold text-secondary">{labels.votedFor.replace("{theme}", `${voted.emoji} ${voted.label}`)}</p>
          <p className="text-xs leading-relaxed text-muted">{labels.voted}</p>
          <button
            type="button"
            onClick={() => {
              setPicked(mine);
              setEditing(true);
            }}
            className="min-h-10 self-start rounded-full bg-background px-4 text-sm font-bold text-secondary shadow-sm"
          >
            {labels.change}
          </button>
        </div>
      )}

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

      {/* Confirm (sticks to the bottom of the screen while you scroll the long list). */}
      {editing && signedIn && (
        <div className="sticky bottom-24 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!picked || busy || picked === mine}
            className="min-h-12 flex-1 rounded-full bg-accent px-5 font-extrabold text-white shadow-lg transition-opacity disabled:opacity-40"
          >
            {theme(picked) ? `${labels.confirm} · ${theme(picked)!.emoji}` : labels.confirm}
          </button>
          {mine && (
            <button type="button" onClick={() => setEditing(false)} className="min-h-12 rounded-full bg-background px-5 font-bold shadow-sm">
              {labels.cancel}
            </button>
          )}
        </div>
      )}

      {failed && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {labels.failed}
        </p>
      )}
    </section>
  );
}
