"use client";

import { useEffect, useRef, useState } from "react";
import { LocalTime } from "@/app/LocalTime";

const KINDS = ["HEART", "LAUGH", "FIRE", "WOW"] as const;
type Kind = (typeof KINDS)[number];
const EMOJI: Record<Kind, string> = { HEART: "❤️", LAUGH: "😂", FIRE: "🔥", WOW: "😮" };
type Reactions = { counts: Record<Kind, number>; mine: Kind | null };

export type GalleryAngle = {
  id: string;
  mediaType: "PHOTO" | "VIDEO";
  presence: "THERE" | "REMOTE";
  contributorName: string;
  capturedAt: string | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
  reactions: Reactions;
};

type Labels = {
  open: string;
  close: string;
  prev: string;
  next: string;
  counter: string;
  label: string;
  thereTag: string;
  remoteTag: string;
  reactions: Record<Kind, string> & { react: string; joinToReact: string };
};

const total = (r: Reactions) => KINDS.reduce((sum, k) => sum + r.counts[k], 0);
const topKind = (r: Reactions) => KINDS.reduce((best, k) => (r.counts[k] > r.counts[best] ? k : best), KINDS[0]);

// The grid of a moment's angles, plus a full-screen viewer that swipes sideways
// between angles of the same moment — the horizontal half of MOVA's two-way feed.
// Swiping is native scroll-snap, so it follows the finger on phones with no library.
export function AngleGallery({
  angles,
  locale,
  labels,
  canReact,
}: {
  angles: GalleryAngle[];
  locale: string;
  labels: Labels;
  canReact: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [reactions, setReactions] = useState(() => new Map(angles.map((a) => [a.id, a.reactions])));
  const reactionsOf = (id: string) => reactions.get(id)!;

  // Quick taps on a slow connection: requests for one angle are sent one after another
  // (so the server applies them in tap order), and only the answer to the latest tap
  // may overwrite what is on screen.
  const latestTap = useRef(new Map<string, number>());
  const queue = useRef(new Map<string, Promise<unknown>>());

  // Optimistic: show the change at once, then settle on what the server counted.
  async function react(angleId: string, kind: Kind) {
    const before = reactionsOf(angleId);
    const next = before.mine === kind ? null : kind;
    const counts = { ...before.counts };
    if (before.mine) counts[before.mine]--;
    if (next) counts[next]++;
    setReactions((m) => new Map(m).set(angleId, { counts, mine: next }));

    const tap = (latestTap.current.get(angleId) ?? 0) + 1;
    latestTap.current.set(angleId, tap);
    const send = async () => {
      const res = await fetch(`/api/angles/${angleId}/reaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: next }),
      }).catch(() => null);
      const settled: Reactions = res?.ok ? await res.json() : before;
      if (latestTap.current.get(angleId) === tap) setReactions((m) => new Map(m).set(angleId, settled));
    };
    const run = (queue.current.get(angleId) ?? Promise.resolve()).then(send);
    queue.current.set(angleId, run);
    await run;
  }

  const slides = () => Array.from(trackRef.current?.children ?? []) as HTMLElement[];
  const goTo = (index: number, smooth = true) =>
    slides()[index]?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", inline: "center", block: "nearest" });

  function open(index: number) {
    setCurrent(index);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => goTo(index, false));
  }

  // Track which slide is on screen, and pause any video that scrolled away.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = slides().indexOf(entry.target as HTMLElement);
          if (entry.isIntersecting) setCurrent(index);
          else entry.target.querySelector("video")?.pause();
        }
      },
      { root: track, threshold: 0.6 },
    );
    slides().forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [angles.length]);

  // Visitors without a name yet: close the viewer and take them to the name form.
  function join() {
    dialogRef.current?.close();
    document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const rtl = document.documentElement.dir === "rtl";
    if (event.key === "ArrowLeft") goTo(current + (rtl ? 1 : -1));
    if (event.key === "ArrowRight") goTo(current + (rtl ? -1 : 1));
  }

  const caption = (a: GalleryAngle) => (
    <>
      <span className="truncate">{a.contributorName}</span>
      <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
        {a.presence === "REMOTE" ? labels.remoteTag : labels.thereTag}
      </span>
    </>
  );

  return (
    <>
      <ul className="contents">
        {angles.map((a, i) => (
          <li key={a.id} id={`angle-${a.id}`} className="relative overflow-hidden rounded-2xl bg-surface">
            <button type="button" onClick={() => open(i)} aria-label={`${labels.open}: ${a.contributorName}`} className="block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable */}
              <img
                src={(a.mediaType === "VIDEO" ? a.thumbUrl : a.mediaUrl) ?? ""}
                alt=""
                loading="lazy"
                className="aspect-[3/4] w-full object-cover"
              />
              {a.mediaType === "VIDEO" && (
                <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45">
                  <svg viewBox="0 0 24 24" className="size-6 fill-white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
              {total(reactionsOf(a.id)) > 0 && (
                <span className="pointer-events-none absolute start-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-bold text-white">
                  {EMOJI[topKind(reactionsOf(a.id))]} {total(reactionsOf(a.id))}
                </span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-bold text-white">
                {caption(a)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={labels.label}
        onKeyDown={onKeyDown}
        onClose={() => slides().forEach((s) => s.querySelector("video")?.pause())}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        <div ref={trackRef} className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]">
          {angles.map((a) => (
            <figure key={a.id} className="relative flex h-full w-screen shrink-0 snap-center items-center justify-center">
              {a.mediaType === "VIDEO" ? (
                <video src={a.mediaUrl ?? undefined} poster={a.thumbUrl ?? undefined} controls playsInline preload="none" className="max-h-full max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img src={a.mediaUrl ?? ""} alt={a.contributorName} className="max-h-full max-w-full object-contain" />
              )}
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 text-sm font-bold">
                {caption(a)}
                {a.capturedAt && (
                  <span className="ms-auto font-normal text-white/80">
                    <LocalTime iso={a.capturedAt} locale={locale} />
                  </span>
                )}
              </figcaption>
              <div className="absolute inset-x-0 bottom-14 flex justify-center gap-2 px-4">
                {KINDS.map((kind) => {
                  const r = reactionsOf(a.id);
                  const active = r.mine === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={active}
                      aria-label={canReact ? labels.reactions.react.replace("{name}", labels.reactions[kind]) : labels.reactions.joinToReact}
                      onClick={() => (canReact ? react(a.id, kind) : join())}
                      className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-lg font-bold transition-colors ${active ? "bg-white text-black" : "bg-black/50 text-white"}`}
                    >
                      <span aria-hidden="true">{EMOJI[kind]}</span>
                      {r.counts[kind] > 0 && <span className="text-sm">{r.counts[kind]}</span>}
                    </button>
                  );
                })}
              </div>
            </figure>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold" aria-live="polite">
            {labels.counter.replace("{i}", String(current + 1)).replace("{n}", String(angles.length))}
          </span>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={labels.close}
            className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/50"
          >
            <svg viewBox="0 0 24 24" className="size-6 stroke-white" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {angles.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              aria-label={labels.prev}
              className="absolute start-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-30 sm:flex"
            >
              <svg viewBox="0 0 24 24" className="size-6 stroke-white rtl:rotate-180" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current === angles.length - 1}
              aria-label={labels.next}
              className="absolute end-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-30 sm:flex"
            >
              <svg viewBox="0 0 24 24" className="size-6 stroke-white rtl:rotate-180" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
